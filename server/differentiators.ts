export type CatalogLike = { tables: Array<{ schema: string; name: string; columns: Array<{ name: string; dataType: string; nullable?: boolean }> }>; relationships?: Array<{ fromTable: string; fromColumn: string; toTable: string; toColumn: string }>; indexes?: Array<{ schema: string; name: string; definition: string }>; views?: Array<{ schema: string; name: string }> };

export type DriftChange = { kind: "table_added" | "table_removed" | "column_added" | "column_removed" | "column_type_changed"; object: string; severity: "low" | "medium" | "high"; detail: string };

export function diffCatalogs(previous: CatalogLike | null, current: CatalogLike): DriftChange[] {
  if (!previous) return current.tables.map(table => ({ kind: "table_added", object: `${table.schema}.${table.name}`, severity: "low", detail: "First observed in the current catalog." }));
  const changes: DriftChange[] = [];
  const before = new Map(previous.tables.map(table => [`${table.schema}.${table.name}`, table]));
  const after = new Map(current.tables.map(table => [`${table.schema}.${table.name}`, table]));
  for (const [key, table] of Array.from(after.entries())) if (!before.has(key)) changes.push({ kind: "table_added", object: key, severity: "medium", detail: "A new table appeared in the current catalog." });
  for (const [key] of Array.from(before.entries())) if (!after.has(key)) changes.push({ kind: "table_removed", object: key, severity: "high", detail: "A previously observed table is absent from the current catalog." });
  for (const [key, table] of Array.from(after.entries())) {
    const old = before.get(key);
    if (!old) continue;
    const oldColumns = new Map(old.columns.map(column => [column.name, column]));
    const newColumns = new Map(table.columns.map(column => [column.name, column]));
    for (const [columnName, column] of Array.from(newColumns.entries())) {
      if (!oldColumns.has(columnName)) changes.push({ kind: "column_added", object: `${key}.${columnName}`, severity: "low", detail: "A column appeared in the current catalog." });
      else if (oldColumns.get(columnName)?.dataType !== column.dataType) changes.push({ kind: "column_type_changed", object: `${key}.${columnName}`, severity: "high", detail: `Type changed from ${oldColumns.get(columnName)?.dataType} to ${column.dataType}.` });
    }
    for (const [columnName] of Array.from(oldColumns.entries())) if (!newColumns.has(columnName)) changes.push({ kind: "column_removed", object: `${key}.${columnName}`, severity: "high", detail: "A previously observed column is absent from the current catalog." });
  }
  return changes;
}

export function buildBlastRadius(catalog: CatalogLike, objectName: string) {
  const relationships = (catalog.relationships ?? []).filter(item => item.fromTable === objectName || item.toTable === objectName);
  const indexes = (catalog.indexes ?? []).filter(item => item.definition.includes(objectName));
  const views = (catalog.views ?? []).filter(item => item.name.includes(objectName.split(".").pop() ?? objectName));
  const nodeMap = new Map<string, { id: string; label: string; type: string }>();
  const edges: Array<{ from: string; to: string; type: string; label: string }> = [];
  const addNode = (id: string, type: string) => { if (!nodeMap.has(id)) nodeMap.set(id, { id, label: id, type }); };
  addNode(objectName, "target");
  relationships.forEach(item => { addNode(item.fromTable, "table"); addNode(item.toTable, "table"); edges.push({ from: item.fromTable, to: item.toTable, type: "foreign_key", label: `${item.fromColumn} → ${item.toColumn}` }); });
  indexes.forEach(item => { addNode(item.name, "index"); edges.push({ from: objectName, to: item.name, type: "index", label: "indexed by" }); });
  views.forEach(item => { addNode(item.name, "view"); edges.push({ from: objectName, to: item.name, type: "view", label: "view dependency" }); });
  return { objectName, relationships, indexes, views, nodes: Array.from(nodeMap.values()), edges, risk: relationships.length + views.length > 5 ? "high" : relationships.length + views.length > 0 ? "medium" : "low" as const };
}

export function fingerprintSql(sql: string) { return sql.replace(/'(?:''|[^'])*'/g, "?").replace(/\b\d+(?:\.\d+)?\b/g, "?").replace(/\s+/g, " ").trim().toLowerCase(); }

export function costGuard(plan: { totalCost?: number; planRows?: number; nodeType?: string } | null) {
  if (!plan) return { status: "unknown" as const, reasons: ["No EXPLAIN evidence is available."] };
  const reasons = [
    ...(plan.nodeType === "Seq Scan" ? ["Sequential scan detected."] : []),
    ...((plan.totalCost ?? 0) > 10000 ? [`Planner total cost is ${plan.totalCost}.`] : []),
    ...((plan.planRows ?? 0) > 100000 ? [`Planner estimates ${plan.planRows} rows.`] : []),
  ];
  return { status: reasons.length ? "review" as const : "clear" as const, reasons };
}

export function checkContract(catalog: CatalogLike, contract: { table: string; columns: Array<{ name: string; dataType?: string; nullable?: boolean }> }) {
  const table = catalog.tables.find(item => `${item.schema}.${item.name}` === contract.table || item.name === contract.table);
  if (!table) return { status: "violation" as const, issues: [`Table ${contract.table} was not found.`] };
  const issues = contract.columns.flatMap(expected => {
    const actual = table.columns.find(column => column.name === expected.name);
    return !actual ? [`Missing column ${expected.name}.`] : expected.dataType && actual.dataType !== expected.dataType ? [`${expected.name} type changed from ${expected.dataType} to ${actual.dataType}.`] : [];
  });
  return { status: issues.length ? "violation" as const : "pass" as const, issues };
}

export function semanticSimilarity(a: string, b: string) {
  const left = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const right = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const overlap = Array.from(left).filter(token => right.has(token)).length;
  return overlap / Math.max(1, new Set(Array.from(left).concat(Array.from(right))).size);
}
