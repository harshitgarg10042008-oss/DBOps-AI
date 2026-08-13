import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditEvents,
  databaseConnections,
  evidenceItems,
  policyDecisions,
  policyRules,
  dataContracts,
  queryExecutions,
  queryRequests,
  schemaSnapshots,
  sqlProposals,
  users,
  workspaceMembers,
  workspaces,
  type InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function ensureWorkspace(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const membership = await db.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1);
  if (membership[0]) return membership[0].workspaceId;
  const created = await db.insert(workspaces).values({ name: "Primary Operations", ownerId: userId });
  const workspaceId = Number(created[0].insertId);
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
  return workspaceId;
}

export async function isWorkspaceMember(userId: number, workspaceId: number) {
  const db = await getDb();
  if (!db) return false;
  const row = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId))).limit(1);
  return Boolean(row[0]);
}

export async function listConnections(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: databaseConnections.id, displayName: databaseConnections.displayName, host: databaseConnections.host, port: databaseConnections.port, databaseName: databaseConnections.databaseName, username: databaseConnections.username, sslMode: databaseConnections.sslMode, status: databaseConnections.status, lastError: databaseConnections.lastError, lastVerifiedAt: databaseConnections.lastVerifiedAt, createdAt: databaseConnections.createdAt }).from(databaseConnections).where(eq(databaseConnections.workspaceId, workspaceId)).orderBy(desc(databaseConnections.updatedAt));
}

export async function getConnection(workspaceId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(databaseConnections).where(and(eq(databaseConnections.id, id), eq(databaseConnections.workspaceId, workspaceId))).limit(1);
  return result[0];
}

export async function saveSchemaSnapshot(connectionId: number, catalog: { tables: unknown[]; relationships: unknown[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const columnCount = catalog.tables.reduce<number>((sum, table) => sum + ((table as { columns?: unknown[] }).columns ?? []).length, 0);
  const snapshot = await db.insert(schemaSnapshots).values({ connectionId, tableCount: catalog.tables.length, columnCount, relationshipCount: catalog.relationships.length, metadata: catalog });
  return Number(snapshot[0].insertId);
}

export async function listSchemaSnapshots(connectionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(schemaSnapshots).where(eq(schemaSnapshots.connectionId, connectionId)).orderBy(desc(schemaSnapshots.createdAt)).limit(2);
}

export async function listReplayHistory(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  const requests = await db.select().from(queryRequests).where(eq(queryRequests.workspaceId, workspaceId)).orderBy(desc(queryRequests.createdAt)).limit(40);
  const output = [];
  for (const request of requests) {
    const proposal = await db.select({ sqlText: sqlProposals.sqlText }).from(sqlProposals).where(eq(sqlProposals.requestId, request.id)).limit(1);
    const execution = await db.select({ durationMs: queryExecutions.durationMs, rowsReturned: queryExecutions.rowsReturned, status: queryExecutions.status, createdAt: queryExecutions.createdAt }).from(queryExecutions).where(eq(queryExecutions.requestId, request.id)).orderBy(desc(queryExecutions.createdAt)).limit(1);
    output.push({ ...request, sqlText: proposal[0]?.sqlText ?? null, execution: execution[0] ?? null });
  }
  return output;
}

export async function getFlightBundle(workspaceId: number, requestId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const request = await db.select().from(queryRequests).where(and(eq(queryRequests.workspaceId, workspaceId), eq(queryRequests.id, requestId))).limit(1);
  if (!request[0]) return undefined;
  const [proposal, policy, execution, evidence, audit] = await Promise.all([
    db.select().from(sqlProposals).where(eq(sqlProposals.requestId, requestId)).limit(1),
    db.select().from(policyDecisions).where(eq(policyDecisions.requestId, requestId)).orderBy(desc(policyDecisions.createdAt)).limit(1),
    db.select().from(queryExecutions).where(eq(queryExecutions.requestId, requestId)).orderBy(desc(queryExecutions.createdAt)).limit(1),
    db.select().from(evidenceItems).where(eq(evidenceItems.requestId, requestId)).orderBy(desc(evidenceItems.createdAt)),
    db.select().from(auditEvents).where(and(eq(auditEvents.workspaceId, workspaceId), eq(auditEvents.requestId, requestId))).orderBy(auditEvents.createdAt),
  ]);
  return { request: request[0], proposal: proposal[0] ?? null, policy: policy[0] ?? null, execution: execution[0] ?? null, evidence, audit };
}

export async function approveProposal(workspaceId: number, proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ id: sqlProposals.id }).from(sqlProposals).innerJoin(queryRequests, eq(sqlProposals.requestId, queryRequests.id)).where(and(eq(sqlProposals.id, proposalId), eq(queryRequests.workspaceId, workspaceId))).limit(1);
  if (!rows[0]) throw new Error("Proposal is not available in your workspace");
  await db.update(sqlProposals).set({ approved: 1 }).where(eq(sqlProposals.id, proposalId));
}

export async function listSemanticProposals(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: sqlProposals.id, requestId: sqlProposals.requestId, sqlText: sqlProposals.sqlText, assumptions: sqlProposals.assumptions, confidence: sqlProposals.confidence, approved: sqlProposals.approved, question: queryRequests.naturalLanguageRequest, createdAt: sqlProposals.createdAt }).from(sqlProposals).innerJoin(queryRequests, eq(sqlProposals.requestId, queryRequests.id)).where(and(eq(queryRequests.workspaceId, workspaceId), eq(sqlProposals.approved, 1))).orderBy(desc(sqlProposals.createdAt)).limit(20);
}

export async function latestSchemaSnapshot(connectionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(schemaSnapshots).where(eq(schemaSnapshots.connectionId, connectionId)).orderBy(desc(schemaSnapshots.createdAt)).limit(1);
  return result[0];
}

export async function createQueryRequest(data: typeof queryRequests.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.insert(queryRequests).values(data);
  return Number(result[0].insertId);
}

export async function saveProposal(data: typeof sqlProposals.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(sqlProposals).values(data).onDuplicateKeyUpdate({ set: { sqlText: data.sqlText, tables: data.tables, columns: data.columns, assumptions: data.assumptions, confidence: data.confidence, model: data.model } });
}

export async function savePolicyDecision(data: typeof policyDecisions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(policyDecisions).values(data);
}

export async function saveExecution(data: typeof queryExecutions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(queryExecutions).values(data);
}

export async function saveEvidence(data: typeof evidenceItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(evidenceItems).values(data);
}

export async function updateQueryStatus(id: number, status: typeof queryRequests.$inferInsert.status, clarification?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(queryRequests).set({ status, clarification }).where(eq(queryRequests.id, id));
}

export async function addAuditEvent(data: typeof auditEvents.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(auditEvents).values(data);
}

export async function listAuditEvents(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.createdAt)).limit(80);
}

export async function listRecentQueries(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(queryRequests).where(eq(queryRequests.workspaceId, workspaceId)).orderBy(desc(queryRequests.createdAt)).limit(20);
}

export async function listPlanEvidence(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: evidenceItems.id, requestId: evidenceItems.requestId, payload: evidenceItems.payload, createdAt: evidenceItems.createdAt }).from(evidenceItems).innerJoin(queryRequests, eq(evidenceItems.requestId, queryRequests.id)).where(and(eq(queryRequests.workspaceId, workspaceId), eq(evidenceItems.evidenceType, "plan"))).orderBy(desc(evidenceItems.createdAt)).limit(20);
}

export async function listSlowQueries(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: queryExecutions.id, requestId: queryExecutions.requestId, durationMs: queryExecutions.durationMs, rowsReturned: queryExecutions.rowsReturned, status: queryExecutions.status, createdAt: queryExecutions.createdAt }).from(queryExecutions).innerJoin(queryRequests, eq(queryExecutions.requestId, queryRequests.id)).where(eq(queryRequests.workspaceId, workspaceId)).orderBy(desc(queryExecutions.durationMs)).limit(10);
}

export async function listWorkspaceMembers(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: workspaceMembers.id, userId: users.id, name: users.name, email: users.email, role: workspaceMembers.role, createdAt: workspaceMembers.createdAt }).from(workspaceMembers).innerJoin(users, eq(workspaceMembers.userId, users.id)).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(desc(workspaceMembers.createdAt));
}

export async function listPolicyRules(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(policyRules).where(eq(policyRules.workspaceId, workspaceId)).orderBy(desc(policyRules.createdAt));
}

export async function createPolicyRule(data: typeof policyRules.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.insert(policyRules).values(data);
  return Number(result[0].insertId);
}

export async function listDataContracts(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataContracts).where(eq(dataContracts.workspaceId, workspaceId)).orderBy(desc(dataContracts.updatedAt));
}

export async function createDataContract(data: typeof dataContracts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.insert(dataContracts).values(data);
  return Number(result[0].insertId);
}

export async function schemaStats(workspaceId: number) {
  const db = await getDb();
  if (!db) return { tables: 0, columns: 0, relationships: 0 };
  const rows = await db.select({ snapshot: schemaSnapshots.metadata }).from(schemaSnapshots).innerJoin(databaseConnections, eq(schemaSnapshots.connectionId, databaseConnections.id)).where(eq(databaseConnections.workspaceId, workspaceId)).orderBy(desc(schemaSnapshots.createdAt)).limit(1);
  const metadata = rows[0]?.snapshot as { tables?: unknown[]; relationships?: unknown[] } | undefined;
  return { tables: metadata?.tables?.length ?? 0, columns: (metadata?.tables ?? []).reduce<number>((sum, table) => sum + (((table as { columns?: unknown[] }).columns ?? []).length), 0), relationships: metadata?.relationships?.length ?? 0 };
}
