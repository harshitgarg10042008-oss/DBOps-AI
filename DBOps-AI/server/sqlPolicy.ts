import { parse } from "pgsql-ast-parser";
import type { Catalog } from "./postgres";

export type PolicyDecision = {
  decision: "allow" | "reject" | "clarification";
  riskClass: "safe_read" | "review_required" | "high_risk";
  reasons: string[];
  normalizedSql?: string;
  tables: string[];
  columns: string[];
};

const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|VACUUM|ANALYZE|CALL|DO|COPY|MERGE)\b/i;
const dangerousFunctions = /\b(pg_sleep|dblink_connect|lo_import|lo_export)\s*\(/i;
const leadingRead = /^\s*(SELECT|WITH|EXPLAIN)\b/i;

function catalogIdentifiers(catalog: Catalog) {
  const tables = new Set<string>();
  const columns = new Set<string>();
  for (const table of catalog.tables) {
    tables.add(table.name.toLowerCase());
    tables.add(`${table.schema}.${table.name}`.toLowerCase());
    for (const column of table.columns) {
      columns.add(column.name.toLowerCase());
      columns.add(`${table.name}.${column.name}`.toLowerCase());
      columns.add(`${table.schema}.${table.name}.${column.name}`.toLowerCase());
    }
  }
  return { tables, columns };
}

function collectIdentifiers(node: unknown, tables: string[], columns: string[]) {
  if (!node || typeof node !== "object") return;
  const value = node as Record<string, unknown>;
  if (value.type === "ref" && typeof value.name === "string") columns.push(value.name);
  if ((value.type === "table" || value.type === "tableRef") && typeof value.name === "string") tables.push(value.name);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => collectIdentifiers(item, tables, columns));
    else collectIdentifiers(child, tables, columns);
  }
}

export function validateReadOnlySql(sql: string, catalog: Catalog): PolicyDecision {
  const reasons: string[] = [];
  const tables: string[] = [];
  const columns: string[] = [];
  const trimmed = sql.trim();

  if (!trimmed) return { decision: "reject", riskClass: "high_risk", reasons: ["SQL proposal is empty."], tables, columns };
  if (!leadingRead.test(trimmed)) reasons.push("Only SELECT, WITH, and EXPLAIN statements are allowed.");
  if (forbidden.test(trimmed)) reasons.push("The proposal contains a write, destructive, maintenance, or permission-changing operation.");
  if (dangerousFunctions.test(trimmed)) reasons.push("The proposal contains a blocked database function.");
  if (trimmed.replace(/;\s*$/, "").includes(";")) reasons.push("Multiple SQL statements are not allowed.");
  if (trimmed.length > 12000) reasons.push("SQL proposal exceeds the maximum allowed length.");

  let ast: unknown[] = [];
  try {
    ast = parse(trimmed);
  } catch {
    reasons.push("SQL could not be parsed as PostgreSQL syntax.");
  }
  if (ast.length !== 1) reasons.push("Exactly one SQL statement is required.");
  if (ast[0]) collectIdentifiers(ast[0], tables, columns);

  const known = catalogIdentifiers(catalog);
  const unknownTables = tables.filter(name => !known.tables.has(name.toLowerCase()) && !name.includes("."));
  const unknownColumns = columns.filter(name => !known.columns.has(name.toLowerCase()) && !["*", "count", "sum", "avg", "min", "max"].includes(name.toLowerCase()));
  if (unknownTables.length) reasons.push(`Unknown table identifiers: ${unknownTables.slice(0, 5).join(", ")}.`);
  if (unknownColumns.length) reasons.push(`Unknown column identifiers: ${unknownColumns.slice(0, 5).join(", ")}.`);

  return {
    decision: reasons.length ? "reject" : "allow",
    riskClass: reasons.length ? "high_risk" : "safe_read",
    reasons: reasons.length ? reasons : ["Validated as a single read-only PostgreSQL statement."],
    normalizedSql: trimmed.replace(/\s+/g, " "),
    tables: Array.from(new Set(tables)),
    columns: Array.from(new Set(columns)),
  };
}
