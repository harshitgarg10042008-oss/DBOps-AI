import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ ownerIdx: index("workspace_owner_idx").on(table.ownerId) }));

export const workspaceMembers = mysqlTable("workspaceMembers", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "viewer"]).default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  membershipUnique: uniqueIndex("workspace_membership_unique").on(table.workspaceId, table.userId),
  workspaceIdx: index("member_workspace_idx").on(table.workspaceId),
  userIdx: index("member_user_idx").on(table.userId),
}));

export const databaseConnections = mysqlTable("databaseConnections", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  createdById: int("createdById").notNull(),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").default(5432).notNull(),
  databaseName: varchar("databaseName", { length: 160 }).notNull(),
  username: varchar("username", { length: 160 }).notNull(),
  encryptedPassword: text("encryptedPassword").notNull(),
  sslMode: mysqlEnum("sslMode", ["require", "prefer", "disable"]).default("require").notNull(),
  status: mysqlEnum("status", ["unknown", "connected", "failed", "permission_denied", "schema_unavailable"]).default("unknown").notNull(),
  lastError: text("lastError"),
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ workspaceIdx: index("connection_workspace_idx").on(table.workspaceId) }));

export const schemaSnapshots = mysqlTable("schemaSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  connectionId: int("connectionId").notNull(),
  tableCount: int("tableCount").default(0).notNull(),
  columnCount: int("columnCount").default(0).notNull(),
  relationshipCount: int("relationshipCount").default(0).notNull(),
  metadata: json("metadata").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ connectionIdx: index("snapshot_connection_idx").on(table.connectionId) }));

export const queryRequests = mysqlTable("queryRequests", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  connectionId: int("connectionId").notNull(),
  userId: int("userId").notNull(),
  naturalLanguageRequest: text("naturalLanguageRequest").notNull(),
  status: mysqlEnum("status", ["created", "proposed", "blocked", "ready", "executing", "completed", "failed", "clarification"]).default("created").notNull(),
  clarification: text("clarification"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ workspaceIdx: index("query_workspace_idx").on(table.workspaceId), connectionIdx: index("query_connection_idx").on(table.connectionId) }));

export const sqlProposals = mysqlTable("sqlProposals", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  sqlText: text("sqlText").notNull(),
  tables: json("tables").notNull(),
  columns: json("columns").notNull(),
  assumptions: json("assumptions").notNull(),
  confidence: varchar("confidence", { length: 16 }).notNull(),
  model: varchar("model", { length: 120 }),
  promptVersion: varchar("promptVersion", { length: 32 }).default("v1").notNull(),
  approved: int("approved").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ requestIdx: uniqueIndex("proposal_request_unique").on(table.requestId) }));

export const policyDecisions = mysqlTable("policyDecisions", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  decision: mysqlEnum("decision", ["allow", "reject", "clarification"]).notNull(),
  riskClass: mysqlEnum("riskClass", ["safe_read", "review_required", "high_risk"]).notNull(),
  reasons: json("reasons").notNull(),
  normalizedSql: text("normalizedSql"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ requestIdx: index("policy_request_idx").on(table.requestId) }));

export const queryExecutions = mysqlTable("queryExecutions", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  status: mysqlEnum("status", ["success", "timeout", "failed", "limit_reached"]).notNull(),
  durationMs: int("durationMs"),
  rowsReturned: int("rowsReturned"),
  resultPreview: json("resultPreview"),
  errorCode: varchar("errorCode", { length: 80 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ requestIdx: index("execution_request_idx").on(table.requestId) }));

export const evidenceItems = mysqlTable("evidenceItems", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  evidenceType: mysqlEnum("evidenceType", ["schema", "result", "execution", "plan", "error"]).notNull(),
  payload: json("payload").notNull(),
  provenance: varchar("provenance", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ requestIdx: index("evidence_request_idx").on(table.requestId) }));

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  actorId: int("actorId").notNull(),
  connectionId: int("connectionId"),
  requestId: int("requestId"),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  status: varchar("status", { length: 40 }).notNull(),
  metadata: json("metadata").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  workspaceIdx: index("audit_workspace_idx").on(table.workspaceId),
  requestIdx: index("audit_request_idx").on(table.requestId),
  createdIdx: index("audit_created_idx").on(table.createdAt),
}));

export const policyRules = mysqlTable("policyRules", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  version: int("version").default(1).notNull(),
  maxRows: int("maxRows").default(100).notNull(),
  allowedSchemas: json("allowedSchemas").notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ workspaceIdx: index("policy_workspace_idx").on(table.workspaceId) }));

export const dataContracts = mysqlTable("dataContracts", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  connectionId: int("connectionId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  tableName: varchar("tableName", { length: 255 }).notNull(),
  definition: json("definition").notNull(),
  status: mysqlEnum("status", ["active", "paused"]).default("active").notNull(),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ workspaceIdx: index("contract_workspace_idx").on(table.workspaceId), connectionIdx: index("contract_connection_idx").on(table.connectionId) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type DatabaseConnection = typeof databaseConnections.$inferSelect;
export type QueryRequest = typeof queryRequests.$inferSelect;
export type SqlProposal = typeof sqlProposals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type PolicyRule = typeof policyRules.$inferSelect;
export type DataContract = typeof dataContracts.$inferSelect;
