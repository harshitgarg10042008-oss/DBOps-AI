import type { PolicyDecision } from "./sqlPolicy";

export type ExecutionPreflight = {
  action: "block" | "allow";
  queryStatus: "blocked" | "ready";
  policyDecision: PolicyDecision["decision"];
  auditStatus: "review_required" | "override_allowed";
  reason: string;
};

export function evaluateExecutionPreflight(policy: PolicyDecision, guard: { status: string; reasons: string[] }, overrideCostGuard: boolean): ExecutionPreflight {
  if (policy.decision !== "allow") {
    return { action: "block", queryStatus: "blocked", policyDecision: policy.decision, auditStatus: "review_required", reason: policy.reasons.join(" ") };
  }
  if (guard.status === "review" && !overrideCostGuard) {
    return { action: "block", queryStatus: "blocked", policyDecision: "clarification", auditStatus: "review_required", reason: guard.reasons.join(" ") };
  }
  return { action: "allow", queryStatus: "ready", policyDecision: "allow", auditStatus: "override_allowed", reason: guard.reasons.join(" ") || "Preflight checks passed." };
}
