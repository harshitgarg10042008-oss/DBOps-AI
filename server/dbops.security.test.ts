import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, redactSql } from "./crypto";
import { validateReadOnlySql } from "./sqlPolicy";
import { buildBoundedReadOnlySql, summarizePrivilegePosture } from "./postgres";
import { assertEvidenceProvenance, isImmutableAuditEventType, parseSqlProposal, validateEvidenceGrounding } from "./contracts";
import { retrieveRelevantSchema } from "./schemaContext";
import { evaluateExecutionPreflight } from "./executionGuard";
import { canAccessWorkspace } from "./authz";
import { appendAuditEvent } from "./audit";
import { parseExplainPlan } from "./performance";
import { buildBlastRadius, checkContract, costGuard, diffCatalogs, fingerprintSql, semanticSimilarity } from "./differentiators";

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

  it("validates explanation claims against evidence", () => {
    expect(validateEvidenceGrounding("Returned 3 rows in 12ms.", { rowCount: 3, durationMs: 12 }).supported).toBe(true);
    expect(validateEvidenceGrounding("This will improve performance by 90%.", { rowCount: 3 }).supported).toBe(false);
  });

  it("enforces read-only PostgreSQL privilege posture warnings", () => {
    const posture = summarizePrivilegePosture({ current_user: "app", database: "db", is_superuser: true, can_create_database: false, can_create_public_schema: false, has_write_grants: true }, "fallback", "fallback");
    expect(posture.readOnly).toBe(false);
    expect(posture.warnings).toHaveLength(2);
  });

  it("enforces the evidence provenance enum", () => {
    expect(assertEvidenceProvenance("observed")).toBe("observed");
    expect(() => assertEvidenceProvenance("postgres_explain_json")).toThrow();
  });

  it("bounds relevant schema context and expands relationships", () => {
    const relatedCatalog = { ...catalog, relationships: [{ fromSchema: "public", fromTable: "orders", fromColumn: "customer_id", toSchema: "public", toTable: "customers", toColumn: "id" }], tables: [...catalog.tables, { schema: "public", name: "customers", type: "BASE TABLE", columns: [{ name: "id", dataType: "integer", nullable: false, defaultValue: null }] }] };
    const context = retrieveRelevantSchema(relatedCatalog, "orders", { maxTables: 4, maxColumns: 10 });
    expect(context.map(item => item.table)).toEqual(expect.arrayContaining(["orders", "customers"]));
    expect(context.reduce((count, item) => count + item.columns.length, 0)).toBeLessThanOrEqual(10);
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

  it("enforces the procedure-boundary Cost Guard block and override outcomes", () => {
    const guard = costGuard({ totalCost: 20000, planRows: 500000, nodeType: "Seq Scan" });
    const policy = validateReadOnlySql("SELECT id FROM orders", catalog);
    const blocked = evaluateExecutionPreflight(policy, guard, false);
    expect(blocked).toMatchObject({ action: "block", queryStatus: "blocked", policyDecision: "clarification", auditStatus: "review_required" });
    const overridden = evaluateExecutionPreflight(policy, guard, true);
    expect(overridden).toMatchObject({ action: "allow", queryStatus: "ready", policyDecision: "allow", auditStatus: "override_allowed" });
  });

  it("extracts evidence-backed EXPLAIN findings", () => {
    const plan = parseExplainPlan([{ Plan: { "Node Type": "Seq Scan", "Total Cost": 12000, "Plan Rows": 250000 } }]);
    expect(plan.findings.map(item => item.kind)).toEqual(["sequential_scan", "high_cost", "large_estimate"]);
  });

  it("detects schema drift with severity", () => {
    const previous = { tables: [{ schema: "public", name: "orders", columns: [{ name: "id", dataType: "integer" }, { name: "created_at", dataType: "timestamp" }] }] };
    const current = { tables: [{ schema: "public", name: "orders", columns: [{ name: "id", dataType: "bigint" }, { name: "total", dataType: "numeric" }] }] };
    const changes = diffCatalogs(previous, current);
    expect(changes.map(change => change.kind)).toEqual(["column_type_changed", "column_added", "column_removed"]);
    expect(changes[0]?.severity).toBe("high");
  });

  it("calculates blast radius only from observed dependencies", () => {
    const radius = buildBlastRadius({ tables: [], relationships: [{ fromTable: "public.orders", fromColumn: "customer_id", toTable: "public.customers", toColumn: "id" }], indexes: [], views: [] }, "public.orders");
    expect(radius.risk).toBe("medium");
    expect(radius.relationships).toHaveLength(1);
  });

  it("normalizes query fingerprints and scores semantic overlap", () => {
    expect(fingerprintSql("SELECT * FROM orders WHERE id = 42")).toBe("select * from orders where id = ?");
    expect(semanticSimilarity("orders created today", "show orders created yesterday")).toBeGreaterThan(0.3);
  });

  it("checks data contracts against catalog evidence", () => {
    const result = checkContract({ tables: [{ schema: "public", name: "orders", columns: [{ name: "id", dataType: "integer" }] }] }, { table: "public.orders", columns: [{ name: "id", dataType: "integer" }, { name: "total", dataType: "numeric" }] });
    expect(result.status).toBe("violation");
    expect(result.issues[0]).toMatch(/Missing column/);
  });

  it("raises transparent cost guard warnings", () => {
    expect(costGuard({ totalCost: 12000, planRows: 200000, nodeType: "Seq Scan" }).status).toBe("review");
    expect(costGuard({ totalCost: 10, planRows: 2, nodeType: "Index Scan" }).status).toBe("clear");
  });

  it("rejects hallucinated identifiers", () => {
    const result = validateReadOnlySql("SELECT missing_column FROM orders", catalog);
    expect(result.decision).toBe("reject");
    expect(result.reasons.join(" ")).toMatch(/Unknown column/i);
  });
});


describe("DBOps adversarial SQL policy", () => {
  it.each([
    ["SELECT INTO", "SELECT id INTO copied_orders FROM orders"],
    ["COPY", "COPY orders TO '/tmp/orders.csv'"],
    ["sleep function", "SELECT pg_sleep(30) FROM orders"],
    ["sequence mutation", "SELECT nextval('orders_id_seq')"],
    ["EXPLAIN ANALYZE", "EXPLAIN ANALYZE SELECT id FROM orders"],
    ["system catalog", "SELECT usename FROM pg_catalog.pg_user"],
    ["comment smuggling", "SELECT id FROM orders /* ; DROP TABLE orders */"],
    ["CTE side effect", "WITH delayed AS (SELECT pg_sleep(30)) SELECT * FROM delayed"],
  ])("rejects %s", (_label, sql) => {
    expect(validateReadOnlySql(sql, catalog).decision).toBe("reject");
  });

  it("rejects uncataloged schema-qualified tables", () => {
    const result = validateReadOnlySql("SELECT * FROM private.orders", catalog);
    expect(result.decision).toBe("reject");
    expect(result.reasons.join(" ")).toMatch(/uncataloged|unknown/i);
  });
});
