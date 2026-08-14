# DBOps AI Security Hardening v1

## SQL policy contract

DBOps AI uses `pgsql-ast-parser` before execution. The policy is allowlist-oriented: one parsed PostgreSQL statement is required, and the statement must begin as `SELECT`, `WITH`, or `EXPLAIN`. The policy rejects write, destructive, maintenance, permission-changing, and side-effecting operations. It also rejects multiple statements, `SELECT INTO`, `COPY`, dangerous functions, system catalogs, uncataloged tables, and `EXPLAIN ANALYZE`.

The executor provides a second defense layer with `BEGIN READ ONLY`, a server-side statement timeout, and a server-side bounded result wrapper. The LLM output is never treated as a security boundary.

## Adversarial policy cases

The policy test suite covers ordinary writes, mixed multi-statement payloads, comments and semicolon smuggling, unknown tables and columns, blocked functions, `SELECT INTO`, `COPY`, system objects, `EXPLAIN ANALYZE`, nested CTEs, and length limits. Safe single-statement reads must continue to pass.

## Structured SQL proposal

```json
{
  "sql": "SELECT o.id, o.total FROM public.orders o WHERE o.customer_id = 42",
  "tables": ["public.orders"],
  "columns": ["public.orders.id", "public.orders.total", "public.orders.customer_id"],
  "assumptions": ["The requested customer identifier is numeric."],
  "confidence": 0.91,
  "clarificationNeeded": false,
  "clarification": ""
}
```

Every field is validated before policy evaluation. The SQL is length-bounded, arrays are bounded, confidence must be finite and between zero and one, and unknown properties are rejected.

## Evidence provenance

Evidence is persisted with one of four deterministic provenance values: `observed`, `estimated`, `benchmarked`, or `unknown`. The server rejects any other provenance value. AI explanations may summarize observed evidence but may not convert an estimate into an observed result or claim a benchmark that was not run.

## Relevant schema retrieval

Version one uses bounded keyword matching over table, column, and schema names, followed by foreign-key expansion from selected tables. The context is capped at 24 tables and 180 columns. If no question terms match, the first small deterministic catalog slice is used rather than sending the entire database to the model. This strategy is intentionally simple, bounded, and replaceable with embeddings later.

## Catalog freshness

Catalog refresh is manual in version one. Operators explicitly select **Refresh schema**, which creates a new timestamped snapshot and an audit event. Drift comparisons use the latest two snapshots. Polling, `pg_notify`, and event-trigger automation are intentionally deferred until the manual workflow is stable.

## PostgreSQL privilege posture

Connection verification checks the current role, superuser status, database-create privilege, public-schema-create privilege, and observed table write grants. A reachable but over-privileged connection remains visible as connected but returns a warning. Users should still create a dedicated read-only PostgreSQL role; application-level policy is defense in depth, not a replacement for database permissions.

## Remaining operational boundary

Live PostgreSQL findings, EXPLAIN plans, catalog snapshots, and LLM proposal generation require valid runtime configuration. The repository contains no real credentials. The security guarantees that do not require external credentials are covered by deterministic unit tests and the parser/policy/executor code path.
