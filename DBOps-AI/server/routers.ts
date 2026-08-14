import { z } from "zod";
import { eq } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { approveProposal, createDataContract, createPolicyRule, createQueryRequest, ensureWorkspace, getConnection, getDb, getFlightBundle, isWorkspaceMember, latestSchemaSnapshot, listAuditEvents, listConnections, listDataContracts, listPlanEvidence, listPolicyRules, listRecentQueries, listReplayHistory, listSchemaSnapshots, listSemanticProposals, listSlowQueries, listWorkspaceMembers, saveEvidence, saveExecution, savePolicyDecision, saveProposal, saveSchemaSnapshot, schemaStats, updateQueryStatus } from "./db";
import { auditEvents, dataContracts, databaseConnections, policyDecisions, policyRules, queryRequests, sqlProposals, workspaceMembers } from "../drizzle/schema";
import { encryptSecret, redactSql } from "./crypto";
import { collectCatalog, executeReadOnly, verifyPostgresConnection, type Catalog } from "./postgres";
import { validateReadOnlySql } from "./sqlPolicy";
import { parseSqlProposal } from "./contracts";
import { appendAuditEvent } from "./audit";
import { parseExplainPlan } from "./performance";
import { buildBlastRadius, checkContract, costGuard, diffCatalogs, fingerprintSql, semanticSimilarity } from "./differentiators";

const connectionInput = z.object({
  displayName: z.string().min(2).max(160),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(5432),
  databaseName: z.string().min(1).max(160),
  username: z.string().min(1).max(160),
  password: z.string().min(1).max(500),
  sslMode: z.enum(["require", "prefer", "disable"]).default("require"),
});

const proposalSchema = {
  type: "object",
  properties: {
    sql: { type: "string" },
    tables: { type: "array", items: { type: "string" } },
    columns: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    clarificationNeeded: { type: "boolean" },
    clarification: { type: "string" },
  },
  required: ["sql", "tables", "columns", "assumptions", "confidence", "clarificationNeeded", "clarification"],
  additionalProperties: false,
} as const;

async function workspaceFor(userId: number) {
  return ensureWorkspace(userId);
}

async function recordEvent(input: { workspaceId: number; actorId: number; connectionId?: number; requestId?: number; eventType: string; status: string; metadata?: unknown }) {
  await appendAuditEvent({ workspaceId: input.workspaceId, actorId: input.actorId, connectionId: input.connectionId, requestId: input.requestId, eventType: input.eventType, status: input.status, metadata: input.metadata ?? {} });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  workspace: router({
    current: protectedProcedure.query(async ({ ctx }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      return { id: workspaceId, name: "Primary Operations" };
    }),
  }),
  connections: router({
    list: protectedProcedure.query(async ({ ctx }) => listConnections(await workspaceFor(ctx.user.id))),
    create: protectedProcedure.input(connectionInput).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Application database is unavailable");
      const inserted = await db.insert(databaseConnections).values({ workspaceId, createdById: ctx.user.id, displayName: input.displayName, host: input.host, port: input.port, databaseName: input.databaseName, username: input.username, encryptedPassword: encryptSecret(input.password), sslMode: input.sslMode, status: "unknown" });
      const id = Number(inserted[0].insertId);
      await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: id, eventType: "DATABASE_CONNECTED", status: "created", metadata: { displayName: input.displayName, host: input.host, databaseName: input.databaseName } });
      return { id };
    }),
    verify: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.id);
      if (!connection) throw new Error("Connection not found in your workspace");
      const db = await getDb();
      if (!db) throw new Error("Application database is unavailable");
      try {
        await verifyPostgresConnection(connection);
        await db.update(databaseConnections).set({ status: "connected", lastError: null, lastVerifiedAt: new Date() }).where(eq(databaseConnections.id, input.id));
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: input.id, eventType: "DATABASE_VERIFIED", status: "success" });
        return { status: "connected" as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection failed";
        const status = /permission|authentication|authorization/i.test(message) ? "permission_denied" : "failed";
        await db.update(databaseConnections).set({ status, lastError: message.slice(0, 500), lastVerifiedAt: new Date() }).where(eq(databaseConnections.id, input.id));
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: input.id, eventType: "DATABASE_VERIFIED", status, metadata: { error: message.slice(0, 240) } });
        return { status, message };
      }
    }),
    refreshSchema: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.id);
      if (!connection) throw new Error("Connection not found in your workspace");
      try {
        const catalog = await collectCatalog(connection);
        const snapshotId = await saveSchemaSnapshot(input.id, catalog);
        const db = await getDb();
        await db?.update(databaseConnections).set({ status: "connected", lastError: null, lastVerifiedAt: new Date() }).where(eq(databaseConnections.id, input.id));
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: input.id, eventType: "SCHEMA_RETRIEVED", status: "success", metadata: { snapshotId, tableCount: catalog.tables.length, relationshipCount: catalog.relationships.length } });
        return { snapshotId, catalog };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Schema unavailable";
        const db = await getDb();
        await db?.update(databaseConnections).set({ status: "schema_unavailable", lastError: message.slice(0, 500) }).where(eq(databaseConnections.id, input.id));
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: input.id, eventType: "SCHEMA_RETRIEVED", status: "failed", metadata: { error: message.slice(0, 240) } });
        throw new Error("Schema unavailable. Verify the database permissions and try again.");
      }
    }),
    schema: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.id);
      if (!connection) throw new Error("Connection not found in your workspace");
      const snapshot = await latestSchemaSnapshot(input.id);
      return snapshot?.metadata as Catalog | undefined;
    }),
  }),
  assistant: router({
    createRequest: protectedProcedure.input(z.object({ connectionId: z.number().int(), question: z.string().min(3).max(2000) })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.connectionId);
      if (!connection) throw new Error("Connection not found in your workspace");
      const id = await createQueryRequest({ workspaceId, connectionId: input.connectionId, userId: ctx.user.id, naturalLanguageRequest: input.question, status: "created" });
      await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: input.connectionId, requestId: id, eventType: "REQUEST_CREATED", status: "success", metadata: { questionLength: input.question.length } });
      return { id };
    }),
    propose: protectedProcedure.input(z.object({ requestId: z.number().int() })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Application database is unavailable");
      const request = (await db.select().from(queryRequests).where(eq(queryRequests.id, input.requestId)).limit(1))[0];
      if (!request || request.workspaceId !== workspaceId || request.userId !== ctx.user.id) throw new Error("Query request not found in your workspace");
      const snapshot = await latestSchemaSnapshot(request.connectionId);
      if (!snapshot) throw new Error("Refresh the database schema before asking a question.");
      const catalog = snapshot.metadata as Catalog;
      const compactSchema = catalog.tables.map(table => ({ schema: table.schema, table: table.name, columns: table.columns.map(column => `${column.name}:${column.dataType}`) }));
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are DBOps AI, a PostgreSQL operations assistant. Propose one read-only SELECT or EXPLAIN statement. Never invent tables or columns. Ask for clarification when the request is ambiguous. Return only the requested JSON structure. Confidence must reflect evidence, not optimism." },
          { role: "user", content: JSON.stringify({ question: request.naturalLanguageRequest, schema: compactSchema }) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "sql_proposal", strict: true, schema: proposalSchema } },
      });
      const content = response.choices[0]?.message?.content;
      const raw = typeof content === "string" ? JSON.parse(content) : null;
      const parsed = parseSqlProposal(raw);
      if (parsed.clarificationNeeded) {
        await updateQueryStatus(input.requestId, "clarification", parsed.clarification);
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "PROPOSAL_GENERATED", status: "clarification" });
        return { ...parsed, policy: null };
      }
      const policy = validateReadOnlySql(parsed.sql, catalog);
      await saveProposal({ requestId: input.requestId, sqlText: parsed.sql, tables: parsed.tables, columns: parsed.columns, assumptions: parsed.assumptions, confidence: parsed.confidence.toFixed(2), model: "configured-model" });
      await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "PROPOSAL_GENERATED", status: "success", metadata: { confidence: parsed.confidence, tables: parsed.tables } });
      await savePolicyDecision({ requestId: input.requestId, decision: policy.decision, riskClass: policy.riskClass, reasons: policy.reasons, normalizedSql: policy.normalizedSql });
      await updateQueryStatus(input.requestId, policy.decision === "allow" ? "ready" : "blocked");
      await saveEvidence({ requestId: input.requestId, evidenceType: "schema", payload: { tables: policy.tables, columns: policy.columns }, provenance: "schema_snapshot" });
      await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "POLICY_DECISION", status: policy.decision, metadata: { riskClass: policy.riskClass, reasons: policy.reasons } });
      return { ...parsed, policy };
    }),
    execute: protectedProcedure.input(z.object({ requestId: z.number().int(), sql: z.string().min(1), overrideCostGuard: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Application database is unavailable");
      const request = (await db.select().from(queryRequests).where(eq(queryRequests.id, input.requestId)).limit(1))[0];
      if (!request || request.workspaceId !== workspaceId || request.userId !== ctx.user.id) throw new Error("Query request not found in your workspace");
      const connection = await getConnection(workspaceId, request.connectionId);
      if (!connection) throw new Error("Connection not found");
      const snapshot = await latestSchemaSnapshot(request.connectionId);
      if (!snapshot) throw new Error("Schema snapshot is required");
      const policy = validateReadOnlySql(input.sql, snapshot.metadata as Catalog);
      if (policy.decision !== "allow") {
        await savePolicyDecision({ requestId: input.requestId, decision: "reject", riskClass: policy.riskClass, reasons: policy.reasons, normalizedSql: policy.normalizedSql });
        await updateQueryStatus(input.requestId, "blocked");
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "QUERY_BLOCKED", status: "rejected", metadata: { reasons: policy.reasons } });
        throw new Error(policy.reasons.join(" "));
      }
      let preflightPlan: ReturnType<typeof parseExplainPlan> | null = null;
      try {
        const planResult = await executeReadOnly(connection, `EXPLAIN (FORMAT JSON) ${input.sql.replace(/^\s*EXPLAIN(?:\s*\([^)]*\))?/i, "")}`, 1);
        const planPayload = planResult.rows[0]?.["QUERY PLAN"] ?? planResult.rows[0]?.query_plan ?? planResult.rows[0];
        preflightPlan = parseExplainPlan(planPayload);
        const guard = costGuard(preflightPlan);
        if (guard.status === "review" && !input.overrideCostGuard) {
          await savePolicyDecision({ requestId: input.requestId, decision: "clarification", riskClass: "high_risk", reasons: guard.reasons, normalizedSql: policy.normalizedSql });
          await updateQueryStatus(input.requestId, "blocked");
          await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "QUERY_BLOCKED", status: "review_required", metadata: { costGuard: guard } });
          throw new Error(`Cost Guard review required: ${guard.reasons.join(" ")}`);
        }
      } catch (error) {
        if (error instanceof Error && /Cost Guard review required/.test(error.message)) throw error;
        preflightPlan = null;
      }
      await updateQueryStatus(input.requestId, "executing");
      try {
        const result = await executeReadOnly(connection, input.sql, 100);
        let planEvidence: ReturnType<typeof parseExplainPlan> | null = null;
        try {
          const planResult = await executeReadOnly(connection, `EXPLAIN (FORMAT JSON) ${input.sql.replace(/^\s*EXPLAIN(?:\s*\([^)]*\))?/i, "")}`, 1);
          const planPayload = planResult.rows[0]?.["QUERY PLAN"] ?? planResult.rows[0]?.query_plan ?? planResult.rows[0];
          planEvidence = parseExplainPlan(planPayload);
          await saveEvidence({ requestId: input.requestId, evidenceType: "plan", payload: planEvidence, provenance: "postgres_explain_json" });
        } catch {
          planEvidence = null;
        }
        let explanation = "The query completed successfully. Review the returned rows and execution metadata for the supported evidence.";
        try {
          const explanationResponse = await invokeLLM({
            messages: [
              { role: "system", content: "You explain database query results using only the supplied evidence. Never invent trends, causes, business meaning, or values. If evidence is insufficient, say so. Return concise JSON." },
              { role: "user", content: JSON.stringify({ sql: redactSql(input.sql), durationMs: result.durationMs, rowCount: result.rowCount, truncated: result.truncated, rows: result.rows.slice(0, 20) }) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "evidence_explanation", strict: true, schema: { type: "object", properties: { summary: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, limitations: { type: "array", items: { type: "string" } } }, required: ["summary", "evidence", "limitations"], additionalProperties: false } } },
          });
          const content = explanationResponse.choices[0]?.message?.content;
          const structured = typeof content === "string" ? JSON.parse(content) as { summary: string; evidence: string[]; limitations: string[] } : null;
          if (structured?.summary) explanation = structured.summary;
        } catch {
          explanation = "The query completed successfully, but an automated explanation was unavailable. The raw evidence remains available below.";
        }
        await saveExecution({ requestId: input.requestId, status: result.truncated ? "limit_reached" : "success", durationMs: result.durationMs, rowsReturned: result.rows.length, resultPreview: result.rows });
        await saveEvidence({ requestId: input.requestId, evidenceType: "result", payload: { rows: result.rows, rowCount: result.rowCount, explanation }, provenance: "read_only_execution" });
        await saveEvidence({ requestId: input.requestId, evidenceType: "execution", payload: { durationMs: result.durationMs, truncated: result.truncated }, provenance: "query_executor" });
        await updateQueryStatus(input.requestId, "completed");
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "QUERY_EXECUTED", status: "success", metadata: { durationMs: result.durationMs, rowsReturned: result.rows.length, truncated: result.truncated, sql: redactSql(input.sql) } });
        return { ...result, sql: policy.normalizedSql, explanation, plan: planEvidence };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Query failed";
        await saveExecution({ requestId: input.requestId, status: /timeout/i.test(message) ? "timeout" : "failed", errorCode: /timeout/i.test(message) ? "QUERY_TIMEOUT" : "QUERY_FAILED", errorMessage: message.slice(0, 500) });
        await saveEvidence({ requestId: input.requestId, evidenceType: "error", payload: { message: message.slice(0, 500) }, provenance: "query_executor" });
        await updateQueryStatus(input.requestId, "failed");
        await recordEvent({ workspaceId, actorId: ctx.user.id, connectionId: request.connectionId, requestId: input.requestId, eventType: "QUERY_EXECUTED", status: "failed", metadata: { error: message.slice(0, 240) } });
        throw new Error(message);
      }
    }),
  }),
  team: router({
    members: protectedProcedure.query(async ({ ctx }) => listWorkspaceMembers(await workspaceFor(ctx.user.id))),
    changeRole: protectedProcedure.input(z.object({ memberId: z.number().int(), role: z.enum(["admin", "viewer"]) })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Application database is unavailable");
      const membership = (await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, input.memberId)).limit(1))[0];
      if (!membership || membership.workspaceId !== workspaceId) throw new Error("Member is outside your workspace");
      await db.update(workspaceMembers).set({ role: input.role }).where(eq(workspaceMembers.id, input.memberId));
      return { success: true } as const;
    }),
    remove: protectedProcedure.input(z.object({ memberId: z.number().int() })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Application database is unavailable");
      const membership = (await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, input.memberId)).limit(1))[0];
      if (!membership || membership.workspaceId !== workspaceId || membership.role === "owner") throw new Error("Owner membership cannot be removed");
      await db.delete(workspaceMembers).where(eq(workspaceMembers.id, input.memberId));
      return { success: true } as const;
    }),
  }),
  performance: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const [slowQueries, planEvidence] = await Promise.all([listSlowQueries(workspaceId), listPlanEvidence(workspaceId)]);
      const recommendations = planEvidence.flatMap(item => {
        const payload = item.payload as { findings?: Array<{ message: string; evidence: string }> };
        return (payload.findings ?? []).map(finding => ({ requestId: item.requestId, message: finding.message, evidence: finding.evidence }));
      });
      return { slowQueries, plans: planEvidence, recommendations, parser: "json-plan-v1", status: planEvidence.length ? "evidence_available" as const : "awaiting_workload_data" as const };
    }),
  }),
  investigations: router({
    list: protectedProcedure.query(async () => ({ items: [], status: "ready_for_query_trace" as const })),
  }),
  security: router({
    posture: protectedProcedure.query(async () => ({ checks: [], status: "requires_database_permission_scan" as const })),
    scan: protectedProcedure.input(z.object({ connectionId: z.number().int() })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.connectionId);
      if (!connection) throw new Error("Connection not found in your workspace");
      const snapshot = await latestSchemaSnapshot(connection.id);
      if (!snapshot) return { status: "schema_required" as const, checks: [] };
      const catalog = snapshot.metadata as Catalog;
      const columns = catalog.tables.flatMap(table => table.columns.map(column => ({ table: `${table.schema}.${table.name}`, column: column.name })));
      const sensitiveCandidates = columns.filter(item => /email|phone|mobile|address|ssn|tax|passport|birth|name/i.test(item.column)).map(item => ({ type: "potential_sensitive_column", severity: "review", evidence: `${item.table}.${item.column}` }));
      return { status: "evidence_available" as const, checks: [{ type: "platform_read_only", severity: "pass", evidence: "DBOps policy allows SELECT and EXPLAIN only" }, ...sensitiveCandidates] };
    }),
  }),
  evaluation: router({
    benchmark: protectedProcedure.query(async () => ({ cases: [], metrics: { accuracy: null, safetyViolations: null, hallucinationRate: null, latencyMs: null, cost: null }, status: "no_benchmark_run" as const })),
  }),
  differentiators: router({
    drift: protectedProcedure.input(z.object({ connectionId: z.number().int() })).query(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.connectionId);
      if (!connection) throw new Error("Connection not found in your workspace");
      const snapshots = await listSchemaSnapshots(connection.id);
      const current = snapshots[0]?.metadata as Catalog | undefined;
      const previous = snapshots[1]?.metadata as Catalog | undefined;
      return { snapshots: snapshots.length, changes: current ? diffCatalogs(previous ?? null, current) : [], status: current ? "evidence_available" as const : "awaiting_catalog" as const };
    }),
    blastRadius: protectedProcedure.input(z.object({ connectionId: z.number().int(), objectName: z.string().min(1) })).query(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.connectionId);
      if (!connection) throw new Error("Connection not found in your workspace");
      const snapshot = await latestSchemaSnapshot(connection.id);
      return snapshot ? { ...buildBlastRadius(snapshot.metadata as Catalog, input.objectName), status: "evidence_available" as const } : { objectName: input.objectName, relationships: [], indexes: [], views: [], risk: "unknown" as const, status: "awaiting_catalog" as const };
    }),
    replay: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listReplayHistory(await workspaceFor(ctx.user.id));
      return rows.map(row => ({ ...row, fingerprint: fingerprintSql(row.sqlText ?? row.naturalLanguageRequest), beforeAfter: row.execution ? { durationMs: row.execution.durationMs, rowsReturned: row.execution.rowsReturned, status: row.execution.status } : null }));
    }),
    flightBundle: protectedProcedure.input(z.object({ requestId: z.number().int() })).query(async ({ ctx, input }) => {
      const bundle = await getFlightBundle(await workspaceFor(ctx.user.id), input.requestId);
      if (!bundle) throw new Error("Request is not available in your workspace");
      return bundle;
    }),
    memory: protectedProcedure.input(z.object({ question: z.string().min(1) })).query(async ({ ctx, input }) => {
      const proposals = await listSemanticProposals(await workspaceFor(ctx.user.id));
      return proposals.map(item => ({ ...item, similarity: semanticSimilarity(input.question, item.question) })).filter(item => item.similarity >= 0.2).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    }),
    approveMemory: protectedProcedure.input(z.object({ proposalId: z.number().int() })).mutation(async ({ ctx, input }) => { await approveProposal(await workspaceFor(ctx.user.id), input.proposalId); return { success: true }; }),
    costGuard: protectedProcedure.input(z.object({ plan: z.object({ totalCost: z.number().optional(), planRows: z.number().optional(), nodeType: z.string().optional() }).nullable() })).query(({ input }) => costGuard(input.plan)),
    contractCheck: protectedProcedure.input(z.object({ connectionId: z.number().int(), contract: z.object({ table: z.string(), columns: z.array(z.object({ name: z.string(), dataType: z.string().optional(), nullable: z.boolean().optional() })) }) })).query(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.connectionId);
      if (!connection) throw new Error("Connection not found in your workspace");
      const snapshot = await latestSchemaSnapshot(connection.id);
      return snapshot ? checkContract(snapshot.metadata as Catalog, input.contract) : { status: "pending" as const, issues: ["Refresh the schema catalog first."] };
    }),
    policies: protectedProcedure.query(async ({ ctx }) => listPolicyRules(await workspaceFor(ctx.user.id))),
    savePolicy: protectedProcedure.input(z.object({ name: z.string().min(2), maxRows: z.number().int().min(1).max(10000), allowedSchemas: z.array(z.string()).default(["public"]), activate: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const version = (await listPolicyRules(workspaceId)).filter(rule => rule.name === input.name).length + 1;
      const id = await createPolicyRule({ workspaceId, name: input.name, version, maxRows: input.maxRows, allowedSchemas: input.allowedSchemas, status: input.activate ? "active" : "draft", createdById: ctx.user.id });
      await appendAuditEvent({ workspaceId, actorId: ctx.user.id, eventType: "policy_decision", status: "success", metadata: { action: "policy_saved", policyId: id, version } });
      return { id, version };
    }),
    dryRunPolicy: protectedProcedure.input(z.object({ sql: z.string().min(1), maxRows: z.number().int().min(1).max(10000) })).mutation(async ({ input }) => ({ ...validateReadOnlySql(input.sql, { tables: [], relationships: [], indexes: [], constraints: [], views: [] } as Catalog), bounded: input.sql.toLowerCase().includes("limit") || input.maxRows > 0 })),
    contracts: protectedProcedure.query(async ({ ctx }) => listDataContracts(await workspaceFor(ctx.user.id))),
    saveContract: protectedProcedure.input(z.object({ connectionId: z.number().int(), name: z.string().min(2), tableName: z.string().min(1), definition: z.object({ columns: z.array(z.object({ name: z.string(), dataType: z.string().optional() })) }) })).mutation(async ({ ctx, input }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const connection = await getConnection(workspaceId, input.connectionId);
      if (!connection) throw new Error("Connection not found in your workspace");
      const id = await createDataContract({ workspaceId, connectionId: input.connectionId, name: input.name, tableName: input.tableName, definition: input.definition, createdById: ctx.user.id });
      return { id };
    }),
  }),
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const workspaceId = await workspaceFor(ctx.user.id);
      const [connections, queries, audit, slowQueries, schema] = await Promise.all([listConnections(workspaceId), listRecentQueries(workspaceId), listAuditEvents(workspaceId), listSlowQueries(workspaceId), schemaStats(workspaceId)]);
      return { connections, queries, audit, slowQueries, schema, metrics: { databases: connections.length, connected: connections.filter(item => item.status === "connected").length, recentQueries: queries.length, auditEvents: audit.length, slowQueries: slowQueries.length, schemaTables: schema.tables, schemaColumns: schema.columns } };
    }),
    audit: protectedProcedure.query(async ({ ctx }) => listAuditEvents(await workspaceFor(ctx.user.id))),
  }),
});

export type AppRouter = typeof appRouter;
