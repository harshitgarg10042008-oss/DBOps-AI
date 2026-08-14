import type { Catalog } from "./postgres";

export type CompactSchema = Array<{ schema: string; table: string; columns: string[] }>;

function tokenize(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9_]+/).filter(token => token.length > 1));
}

export function retrieveRelevantSchema(catalog: Catalog, question: string, limits = { maxTables: 24, maxColumns: 180 }): CompactSchema {
  const queryTokens = tokenize(question);
  const scored = catalog.tables.map(table => {
    const tableTokens = tokenize(`${table.schema} ${table.name} ${table.columns.map(column => column.name).join(" ")}`);
    const score = Array.from(queryTokens).reduce((total, token) => total + (tableTokens.has(token) ? 1 : 0), 0);
    return { table, score };
  }).sort((a, b) => b.score - a.score || a.table.name.localeCompare(b.table.name));
  const selected = new Set(scored.filter(item => item.score > 0).slice(0, limits.maxTables).map(item => `${item.table.schema}.${item.table.name}`));
  if (selected.size === 0) scored.slice(0, Math.min(8, limits.maxTables)).forEach(item => selected.add(`${item.table.schema}.${item.table.name}`));
  {
    catalog.relationships.forEach(edge => {
      const from = `${edge.fromSchema}.${edge.fromTable}`;
      const to = `${edge.toSchema}.${edge.toTable}`;
      if (selected.has(from) || selected.has(to)) { selected.add(from); selected.add(to); }
    });
  }
  const result: CompactSchema = [];
  let columnCount = 0;
  for (const item of scored) {
    const key = `${item.table.schema}.${item.table.name}`;
    if (!selected.has(key) || result.length >= limits.maxTables) continue;
    const columns = item.table.columns.slice(0, Math.max(0, limits.maxColumns - columnCount)).map(column => `${column.name}:${column.dataType}${column.nullable ? "?" : ""}`);
    result.push({ schema: item.table.schema, table: item.table.name, columns });
    columnCount += columns.length;
    if (columnCount >= limits.maxColumns) break;
  }
  return result;
}
