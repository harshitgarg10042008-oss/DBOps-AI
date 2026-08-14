import { z } from "zod";

export const sqlProposalContract = z.object({
  sql: z.string().trim().min(1).max(12000),
  tables: z.array(z.string().min(1)).max(100),
  columns: z.array(z.string().min(1)).max(300),
  assumptions: z.array(z.string().min(1)).max(20),
  confidence: z.number().finite().min(0).max(1),
  clarificationNeeded: z.boolean(),
  clarification: z.string().max(2000),
}).strict();

export const evidenceProvenanceContract = z.enum(["observed", "estimated", "benchmarked", "unknown"]);
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceContract>;

export function assertEvidenceProvenance(value: string): EvidenceProvenance {
  return evidenceProvenanceContract.parse(value);
}

export function validateEvidenceGrounding(explanation: string, evidence: unknown) {
  const evidenceText = JSON.stringify(evidence);
  const numericClaims = explanation.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  const unsupportedNumbers = numericClaims.filter(value => !evidenceText.includes(value));
  const speculativePhrases = explanation.match(/\b(?:will improve|will prevent|caused by|definitely|guaranteed|likely means|should fix)\b/gi) ?? [];
  return {
    supported: unsupportedNumbers.length === 0 && speculativePhrases.length === 0,
    unsupportedClaims: [...unsupportedNumbers.map(value => `Unsupported numeric claim: ${value}`), ...speculativePhrases.map(value => `Unsupported speculative phrase: ${value}`)],
  };
}

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
