# DBOps-AI Production Readiness Runbook

## Purpose

DBOps-AI is a read-only-first PostgreSQL operations assistant. It accepts natural-language questions, grounds proposals in an observed schema catalog, validates SQL against a deterministic policy, performs an EXPLAIN preflight, applies row and timeout limits, executes only bounded read-only work, and records lifecycle evidence in the MySQL control plane.

This runbook distinguishes implemented controls from checks that require a live PostgreSQL fixture, valid model credentials, and production infrastructure.

## Current verified implementation

The current `main` branch includes the following validated capabilities:

| Capability | Status | Evidence |
|---|---:|---|
| Windows-compatible development startup | Verified | `pnpm dev` uses `cross-env` and the TypeScript watcher. |
| Local development login | Verified | Development mode redirects to `/api/dev/local-login`. |
| Localhost session cookies | Verified | HTTP development uses `SameSite=Lax`; HTTPS uses secure cookies. |
| PostgreSQL connection storage | Implemented | Credentials are encrypted before persistence. |
| Schema catalog refresh | Implemented | Catalogs are collected from PostgreSQL metadata views. |
| Read-only SQL validation | Implemented | Mutation, system-catalog, unobserved-identifier, and unsafe-query checks are enforced. |
| EXPLAIN preflight and cost guard | Implemented | Plans are parsed and high-cost work can be blocked or explicitly overridden. |
| Audit ledger | Implemented | Workspace-scoped lifecycle events are appended for key operations. |
| Drift, blast-radius, replay, query memory, contracts, and policies | Implemented | These use observed catalogs, persisted proposals, and workspace-scoped records. |
| Investigations, security posture, and evaluation surfaces | Evidence-backed | They report real control-plane evidence and explicitly show when evidence is absent. |
| Production environment validation | Implemented | Required production configuration is rejected at startup when missing or placeholder-valued. |
| Automated regression suite | Verified | The repository currently passes 39 tests, TypeScript checking, and production build. |

## Local Windows operation

From PowerShell:

```powershell
cd "C:\Users\vishe\OneDrive\Desktop\Goal\DBOps Ai"
git pull origin main
pnpm install
pnpm db:push
pnpm dev
```

Open `http://localhost:3000/` and use the development login flow. If the browser contains an old session cookie, clear the cookie for `http://localhost:3000` and reload.

Local development may leave OAuth placeholders configured because the development login route is used. Production must not use placeholders.

## Environment rules

Keep secrets in `.env`, never in source files or commits. `DATABASE_URL` is the MySQL/TiDB control-plane connection. A PostgreSQL endpoint is registered separately through the application UI. `JWT_SECRET` must be at least 32 characters for development and at least 48 characters for production. Production also requires a real OAuth application ID, OAuth server URL, model gateway URL, and model gateway key.

If a secret is exposed, revoke or rotate it immediately. Rotating a JWT secret invalidates existing sessions. Rotating the encryption key source without re-encrypting stored credentials makes existing encrypted PostgreSQL passwords unreadable, so plan key rotation as a controlled migration.

## Real-data verification

To produce real operational evidence, register a PostgreSQL endpoint using a dedicated read-only role, verify the connection, and refresh the schema catalog. Then submit a natural-language request, review the generated SQL and policy decision, inspect the EXPLAIN preflight, and execute only after the policy allows it.

The dashboard, Performance, Investigations, Security, Evaluation, Drift, Blast Radius, Replay, Contract, and Audit surfaces should then show records derived from that workflow. Empty states are expected before a live endpoint and query trace exist; they are not claims that a database has no risk.

## Security checklist

Use a least-privilege PostgreSQL role. Prefer SSL `require` and validate the server certificate in production infrastructure. Do not use the application MySQL account as a PostgreSQL target credential. Never place PostgreSQL passwords in browser state or URL parameters. Review sensitive-column candidates before exposing results to operators. Keep workspace membership and owner/admin boundaries intact. Review audit events after policy saves, schema refreshes, blocked queries, executions, team changes, and connection verification.

## Production deployment gate

Before production deployment, configure real OAuth values, a strong JWT secret, a real model gateway, TLS termination, secure cookie settings, centralized secret storage, MySQL backups, restore testing, application monitoring, error alerting, and a rollback procedure. Run the complete test and build commands in CI:

```bash
pnpm check
pnpm test
pnpm build
pnpm exec prettier --check .
```

A successful build is necessary but not sufficient for production readiness. A live PostgreSQL fixture should be used to verify connection, schema refresh, safe proposal, blocked mutation, EXPLAIN guard, bounded execution, audit events, drift detection, contract checks, and security scans.

## GitHub maintenance

Update the local checkout before making changes:

```bash
git pull --rebase origin main
```

Inspect the diff before committing:

```bash
git diff --check
git status
```

Commit only intended source and documentation files. Never commit `.env`, passwords, API keys, generated build output, browser profiles, or local review artifacts.

## Known evidence limits

The application cannot truthfully calculate model accuracy, hallucination rate, or cost without labeled benchmark cases and model telemetry. Security scans identify evidence-backed connection posture and catalog-based sensitive-column candidates; they are not a substitute for a full database security review. Performance findings require executed queries and captured EXPLAIN evidence. These limits are intentionally represented in the UI.

## Latest verified commits

The latest audited changes on `main` include production configuration hardening, evidence-backed governance routes, dynamic evaluation evidence, and regression tests. Check GitHub for the current commit before deploying because the branch may advance after this document is published.
