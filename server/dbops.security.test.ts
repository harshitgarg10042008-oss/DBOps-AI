import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, redactSql } from "./crypto";
import { validateReadOnlySql } from "./sqlPolicy";
import { buildBoundedReadOnlySql } from "./postgres";
import { isImmutableAuditEventType, parseSqlProposal } from "./contracts";
import { canAccessWorkspace } from "./authz";
import { appendAuditEvent } from "./audit";
import { parseExplainPlan } from "./performance";

const catalog = {
  tables: [{ schema: "public", name: "orders", type: "BASE TABLE", columns: [{ name: "id", dataType: "integer", nullable: false, defaultValue: null }, { name: "created_at", dataType: "timestamp", nullable: false, defaultValue: null }] }],
  relationships: [],
  indexes: [],
  views: [],
};

describe("DBOps security primitives", () => {
  it("round-trips encrypted secrets without exposing plaintext", () => {
    const encrypted = encryptSecret("super-secret-password");
    expect(encrypted).not.toContain("super-secret-password");
    expect(decryptSecret(encrypted)).toBe("super-secret-password");
  });

  it("redacts literal SQL values in audit-safe SQL", () => {
    expect(redactSql("SELECT * FROM orders WHERE id = 'secret-value'")).toContain("[REDACTED]");
  });

  it("allows one known read-only query", () => {
    const result = validateReadOnlySql("SELECT id, created_at FROM orders", catalog);
    expect(result.decision).toBe("allow");
    expect(result.riskClass).toBe("safe_read");
  });

  it("rejects mutations and multiple statements", () => {
    const mutation = validateReadOnlySql("DELETE FROM orders", catalog);
    const multi = validateReadOnlySql("SELECT id FROM orders; DROP TABLE orders", catalog);
    expect(mutation.decision).toBe("reject");
    expect(multi.decision).toBe("reject");
    expect(mutation.reasons.join(" ")).toMatch(/write|destructive/i);
  });

  it("applies a server-side result limit before execution", () => {
    expect(buildBoundedReadOnlySql("SELECT id FROM orders", 25)).toContain("LIMIT 25");
    expect(buildBoundedReadOnlySql("EXPLAIN SELECT id FROM orders", 25)).toBe("EXPLAIN SELECT id FROM orders");
  });

  it("rejects malformed structured SQL proposals", () => {
    expect(() => parseSqlProposal({ sql: "SELECT 1" })).toThrow();
    expect(parseSqlProposal({ sql: "SELECT 1", tables: [], columns: [], assumptions: [], confidence: 0.8, clarificationNeeded: false, clarification: "" }).confidence).toBe(0.8);
  });

  it("allows only append-only lifecycle event types", () => {
    expect(isImmutableAuditEventType("PROPOSAL_GENERATED")).toBe(true);
    expect(isImmutableAuditEventType("AUDIT_UPDATED")).toBe(false);
  });

  it("enforces workspace authorization isolation", () => {
    expect(canAccessWorkspace(7, 3, { userId: 7, workspaceId: 3 })).toBe(true);
    expect(canAccessWorkspace(7, 4, { userId: 7, workspaceId: 3 })).toBe(false);
    expect(canAccessWorkspace(8, 3, { userId: 7, workspaceId: 3 })).toBe(false);
  });

  it("rejects unsupported audit mutation-style event paths", async () => {
    await expect(appendAuditEvent({ workspaceId: 1, actorId: 1, eventType: "AUDIT_UPDATED", status: "blocked", metadata: {} })).rejects.toThrow(/Unsupported audit event type/);
  });

  it("extracts evidence-backed EXPLAIN findings", () => {
    const plan = parseExplainPlan([{ Plan: { "Node Type": "Seq Scan", "Total Cost": 12000, "Plan Rows": 250000 } }]);
    expect(plan.findings.map(item => item.kind)).toEqual(["sequential_scan", "high_cost", "large_estimate"]);
  });

  it("rejects hallucinated identifiers", () => {
    const result = validateReadOnlySql("SELECT missing_column FROM orders", catalog);
    expect(result.decision).toBe("reject");
    expect(result.reasons.join(" ")).toMatch(/Unknown column/i);
  });
});
