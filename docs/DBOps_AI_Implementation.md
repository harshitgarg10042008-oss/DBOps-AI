# DBOps AI Implementation Guide

DBOps AI is a read-only-first PostgreSQL operations control plane. The application is deliberately useful before external credentials are supplied: users can authenticate, create isolated workspaces, register encrypted database endpoints, inspect connection states, browse schema metadata, prepare structured AI requests, review deterministic policy decisions, inspect execution evidence, and view append-only audit events.

## Product workflow

The primary workflow is **connect → catalog → ask → propose → verify → execute → explain → audit**. Database credentials remain server-side. The model receives only the selected question and relevant schema context. Every generated SQL proposal is validated by a deterministic policy engine before execution. The executor opens a read-only transaction, applies a server-side statement timeout, applies a server-side row limit, normalizes results, and records evidence.

## Website surfaces

| Surface | Current behavior |
|---|---|
| Command Center | Connection counts, read-only posture, query pulse, slow-query count, schema size, and audit activity. |
| Databases | Encrypted PostgreSQL endpoint registration, connection verification, clear status states, and schema refresh. |
| AI Assistant | Structured natural-language request flow, SQL proposal, assumptions, confidence, policy evidence, constrained execution, raw result preview, and evidence-grounded explanation. |
| Query History | Workspace-scoped request lifecycle list. |
| Performance | Slow-query candidates, plan/recommendation counters, and honest awaiting-evidence state. |
| Security Posture | Deterministic-check status surface without unsupported claims. |
| Investigations | Trace-assembly surface for request, schema, policy, execution, and audit evidence. |
| AI Evaluation | Benchmark metric placeholders that remain empty until a real benchmark run is recorded. |
| Schema Explorer | Searchable tables and columns plus relationships, indexes, views, and constraints. |
| Audit Ledger | Append-only lifecycle event stream scoped to the authenticated workspace. |
| Team | Workspace member roster when membership data exists. |
| Settings | Reserved surface for policy limits, model configuration, and workspace controls. |

## Security contract

The platform does not treat model instructions as a security boundary. The SQL policy engine rejects multiple statements, write operations, destructive operations, unknown identifiers, and unsafe query forms. The database executor adds a read-only transaction, a statement timeout, and a server-side result limit. Credential values are encrypted with server-side AES-GCM before persistence and are never returned to the browser after submission.

Audit events are written through an append-only service wrapper. The application exposes no update or delete procedure for audit records, rejects unsupported event types, and records request creation, schema retrieval, proposal generation, policy decisions, executions, failures, and result evidence.

## Placeholder configuration

The application is intentionally configured to run with platform-provided development settings until external credentials are supplied. Do not commit `.env` files or plaintext database passwords. When credentials are ready, configure them through the project secret management flow and validate them against a real read-only PostgreSQL test endpoint before production use.

## Validation status

The current implementation passes TypeScript checks, Vitest tests, and production builds. The test suite covers encryption round trips, SQL redaction, read-only allowlisting, mutation rejection, multiple-statement rejection, hallucinated identifier rejection, server-side result limiting, structured output failures, workspace authorization isolation, and append-only audit event policy.
