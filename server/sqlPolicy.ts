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

const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|VACUUM|ANALYZE|CALL|DO|COPY|MERGE|REFRESH|CLUSTER|REINDEX)\b/i;
const dangerousFunctions = /\b(pg_sleep|dblink_connect|lo_import|lo_export|nextval|setval|set_config|pg_advisory_lock|pg_advisory_xact_lock|pg_notify|txid_current)\s*\(/i;
const leadingRead = /^\s*(SELECT|WITH|EXPLAIN)\b/i;
const selectInto = /^\s*(?:WITH\b[\s\S]*?\b)?SELECT\b[\s\S]*?\bINTO\b/i;
const explainAnalyze = /^\s*EXPLAIN\s+(?:\([^)]*\bANALYZE\b[^)]*\)|ANALYZE\b)/i;

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

function collectCteAliases(node: unknown, aliases: Set<string>) {
  if (!node || typeof node !== "object") return;
  const value = node as Record<string, unknown>;
  if (value.type === "with" && Array.isArray(value.bind)) {
    value.bind.forEach(item => {
      if (item && typeof item === "object") {
        const alias = (item as Record<string, unknown>).alias;
        if (alias && typeof alias === "object" && typeof (alias as Record<string, unknown>).name === "string") aliases.add(String((alias as Record<string, unknown>).name).toLowerCase());
      }
    });
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => collectCteAliases(item, aliases));
    else collectCteAliases(child, aliases);
  }
}

function collectIdentifiers(node: unknown, tables: string[], columns: string[]) {
  if (!node || typeof node !== "object") return;
  const value = node as Record<string, unknown>;
  if (value.type === "ref" && typeof value.name === "string") columns.push(value.name);
  if ((value.type === "table" || value.type === "tableRef") && typeof value.name === "string") tables.push(value.name);
  if ((value.type === "table" || value.type === "tableRef") && value.name && typeof value.name === "object") {
    const relation = value.name as { schema?: unknown; name?: unknown };
    if (typeof relation.name === "string") tables.push(`${typeof relation.schema === "string" ? `${relation.schema}.` : ""}${relation.name}`);
  }
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
  if (dangerousFunctions.test(trimmed)) reasons.push("The proposal contains a blocked or side-effecting database function.");
  if (selectInto.test(trimmed)) reasons.push("SELECT INTO is not allowed because it creates or writes a relation.");
  if (explainAnalyze.test(trimmed)) reasons.push("EXPLAIN ANALYZE is not allowed because it executes the underlying statement.");
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
  const cteAliases = new Set<string>();
  if (ast[0]) collectCteAliases(ast[0], cteAliases);
  const systemTables = tables.filter(name => /^(?:pg_catalog\.|information_schema\.|pg_)/i.test(name));
  const unknownTables = tables.filter(name => !known.tables.has(name.toLowerCase()) && !cteAliases.has(name.toLowerCase()));
  const unknownColumns = columns.filter(name => !known.columns.has(name.toLowerCase()) && !["*", "count", "sum", "avg", "min", "max"].includes(name.toLowerCase()));
  if (systemTables.length) reasons.push(`System catalog objects are not available to generated SQL: ${systemTables.slice(0, 5).join(", ")}.`);
  if (unknownTables.length) reasons.push(`Unknown or uncataloged table identifiers: ${unknownTables.slice(0, 5).join(", ")}.`);
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
