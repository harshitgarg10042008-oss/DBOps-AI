import { addAuditEvent } from "./db";
import { isImmutableAuditEventType } from "./contracts";

export async function appendAuditEvent(input: Parameters<typeof addAuditEvent>[0]) {
  if (!isImmutableAuditEventType(input.eventType)) {
    throw new Error(`Unsupported audit event type: ${input.eventType}`);
  }
  return addAuditEvent({ ...input, metadata: Object.freeze({ ...(input.metadata as Record<string, unknown>) }) });
}

// This module intentionally exposes no update or delete operation. Audit events are append-only.
