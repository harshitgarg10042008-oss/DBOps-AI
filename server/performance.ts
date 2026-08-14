export type PlanFinding = { kind: "sequential_scan" | "high_cost" | "large_estimate"; message: string; evidence: string };

export function shouldBlockCostGuard(guard: { status: string }, overrideCostGuard: boolean) {
  return guard.status === "review" && !overrideCostGuard;
}

export function parseExplainPlan(payload: unknown): { totalCost: number; planRows: number; nodeType: string; findings: PlanFinding[] } {
  const root = Array.isArray(payload) ? (payload[0] as any)?.Plan ?? {} : (payload as any)?.Plan ?? {};
  const totalCost = Number(root["Total Cost"] ?? 0);
  const planRows = Number(root["Plan Rows"] ?? 0);
  const nodeType = String(root["Node Type"] ?? "Unknown");
  const findings: PlanFinding[] = [];
  if (nodeType === "Seq Scan") findings.push({ kind: "sequential_scan", message: "The plan begins with a sequential scan.", evidence: `Node Type = ${nodeType}` });
  if (totalCost > 10000) findings.push({ kind: "high_cost", message: "The planner estimates a high total cost.", evidence: `Total Cost = ${totalCost}` });
  if (planRows > 100000) findings.push({ kind: "large_estimate", message: "The planner estimates a large row set.", evidence: `Plan Rows = ${planRows}` });
  return { totalCost, planRows, nodeType, findings };
}
