import { z } from "zod";

export const sqlProposalContract = z.object({
  sql: z.string().min(1),
  tables: z.array(z.string()),
  columns: z.array(z.string()),
  assumptions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  clarificationNeeded: z.boolean(),
  clarification: z.string(),
});

export function parseSqlProposal(value: unknown) {
  return sqlProposalContract.parse(value);
}

export const immutableAuditEventTypes = [
  "REQUEST_CREATED",
  "DATABASE_CONNECTED",
  "DATABASE_VERIFIED",
  "SCHEMA_RETRIEVED",
  "PROPOSAL_GENERATED",
  "POLICY_DECISION",
  "QUERY_BLOCKED",
  "QUERY_EXECUTED",
] as const;

export function isImmutableAuditEventType(value: string): value is (typeof immutableAuditEventTypes)[number] {
  return (immutableAuditEventTypes as readonly string[]).includes(value);
}
