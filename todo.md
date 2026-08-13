# Project TODO

- [x] Establish high-contrast cyberpunk visual system and responsive operations-console layout
- [x] Implement authenticated protected routes and strict workspace/user boundaries
- [x] Add PostgreSQL connection management with encrypted server-side credential storage
- [x] Add connection verification and distinct connection status states
- [x] Build schema catalog service for tables, columns, types, keys, indexes, views, and relationships
- [x] Build searchable schema explorer UI
- [x] Implement natural-language database assistant workflow
- [x] Add structured SQL proposal contract with assumptions and confidence
- [x] Add deterministic read-only SQL policy engine for SELECT and EXPLAIN only
- [x] Reject multiple statements, writes, destructive operations, and hallucinated identifiers
- [x] Add constrained query executor with statement timeout and result-size limits
- [x] Build results workspace with SQL, execution metadata, evidence, and explanation
- [x] Ensure evidence-grounded explanations cannot introduce unsupported claims
- [x] Add immutable audit event lifecycle for requests, schema retrieval, proposals, policy decisions, executions, and failures
- [x] Build dashboard with database health indicators and recent activity
- [x] Add navigation for databases, assistant, queries, performance, schema, audit logs, and settings
- [x] Add Vitest coverage for security, authorization, SQL policy, execution limits, structured output, and audit behavior
- [x] Run type checks, tests, and visual verification
- [x] Save final project checkpoint and deliver implementation status

## Verification follow-ups

- [x] Add primary-key and constraint introspection to the schema catalog and expose them in stored metadata
- [x] Extend schema explorer search to include columns and add relationships, indexes, and views panels
- [x] Enforce a true server-side row/result limit during PostgreSQL execution
- [x] Implement evidence-grounded result explanations and display them in the assistant workspace
- [x] Record a distinct successful proposal-generated audit event and strengthen audit immutability guarantees
- [x] Add slow-query and schema-stat indicators to the dashboard
- [x] Add Performance and Settings navigation sections with clear pending states
- [x] Add Vitest coverage for authorization boundaries, execution limits, structured output validation, and audit lifecycle behavior

## Final hardening pass

- [x] Add schema explorer sections that list relationships, indexes, and views instead of only aggregate counts
- [x] Render the execution explanation in the assistant results workspace
- [x] Add explicit audit immutability enforcement with service-level protections and tests
- [x] Add Vitest coverage for workspace authorization boundaries, structured-output failure handling, and audit lifecycle behavior

## Checkpoint readiness

- [x] Add an audit service test proving unsupported or mutation-style event paths are rejected
- [x] Add a workspace authorization isolation test for connection access boundaries
- [x] Save the final project checkpoint and deliver the implementation status

## Full roadmap completion

- [x] Add complete performance workspace with EXPLAIN plan parsing, slow-query findings, and recommendation evidence
- [x] Add settings workspace with connection policies, safety limits, model status, and workspace profile controls
- [x] Add team/workspace member management UI and server procedures
- [x] Add richer audit filtering, event detail view, and lifecycle trace view
- [x] Add investigation workspace with timeline, evidence cards, and planned background-job state
- [x] Add security posture workspace with deterministic permission/PII checks clearly labeled as available or pending
- [x] Add evaluation workspace with benchmark cases, metric cards, and model configuration placeholders
- [x] Add complete onboarding and empty/error/loading states for every navigation surface
- [x] Add production documentation, architecture references, environment placeholder documentation, and roadmap status
- [x] Re-run full tests, build, responsive visual verification, and save final checkpoint

## Final product-completeness pass

- [x] Implement real EXPLAIN plan collection/parsing, surfaced slow-query findings, and evidence-backed recommendations
- [x] Build actual settings controls for safety limits, connection policies, model status, and workspace profile
- [x] Add team management actions for invitations, role changes, and member removal
- [x] Add audit filtering, event detail, and lifecycle trace views
- [x] Implement investigation timeline and evidence-card views with explicit background-job state
- [x] Implement deterministic permission and PII checks with explicit result or pending states
- [x] Add evaluation benchmark case listings and model-configuration placeholder controls
- [x] Audit every route for explicit loading, empty, and error states
- [x] Add dedicated architecture and roadmap-status documentation
- [x] Run responsive screenshots and save a fresh final checkpoint

## Release evidence-display pass

- [x] Surface parsed EXPLAIN findings and evidence-backed recommendations in the Performance UI
- [x] Add a workspace invitation flow or explicitly implement invite-as-pending state with no fabricated delivery
- [x] Add a dedicated audit lifecycle trace grouped by request and event sequence
- [x] Add investigation evidence cards and explicit background-job status
- [x] Add model-configuration placeholder controls inside the Evaluation workspace
- [x] Save a fresh checkpoint after the final evidence-display pass

## Differentiation exploration

- [x] Evaluate and prioritize unique DBOps AI features beyond the current read-only assistant, schema explorer, performance, security, audit, team, and evaluation surfaces
- [x] Define the selected feature set, data model impact, safety boundaries, and phased implementation plan

## Differentiating feature implementation

- [x] Implement Schema Drift Radar with versioned snapshot comparison and severity
- [x] Implement Blast Radius Simulator with dependency and impact graph
- [x] Implement Query Replay Lab with normalized fingerprints and historical comparison
- [x] Implement DBOps Flight Recorder with incident bundles and evidence timeline
- [x] Implement Policy-as-Code Studio with versioned dry-run rules
- [x] Implement Data Contract Watchtower with contract definitions and drift checks
- [x] Implement Explainable Query Cost Guard with pre-execution plan warnings
- [x] Implement Semantic Query Memory with approved query patterns and safe reuse
- [x] Add tests, documentation, navigation, loading states, and responsive UI for all differentiated features
- [x] Run final validation, save checkpoint, and push all changes to GitHub

## Differentiator hardening

- [x] Add blast-radius graph nodes and edges with affected-object mapping
- [x] Base Query Replay on normalized SQL and execution history with before/after comparison
- [x] Build Flight Recorder incident bundles joining request, proposal, policy, execution, evidence, and audit data
- [x] Persist versioned policy rules and add backend dry-run evaluation
- [x] Store contract definitions and add watchtower status/history
- [x] Integrate Cost Guard into the real query execution flow before SQL execution
- [x] Add approval and explicit reuse mechanics for Semantic Query Memory
- [x] Add comprehensive differentiator loading/error states and broader tests
- [x] Save a fresh checkpoint after differentiator hardening

## Final differentiator verification

- [x] Implement a graph model with explicit nodes and edges for Blast Radius and render affected objects from it
- [x] Expand Flight Recorder into a full joined incident timeline with request, proposal, policy, execution, evidence, and audit details
- [x] Add explicit loading and error states per Differentiator Lab surface and tests for persistence, bundles, replay, cost gating, and memory approval

## Final evidence and regression pass

- [x] Render a complete Flight Recorder timeline with request, proposal, policy, execution, evidence items, and audit payload details
- [x] Add explicit loading/error handling to differentiator mutations and each feature panel
- [x] Add regression tests for persisted policies, contracts, flight bundles, replay history, Cost Guard gating, and semantic approval

## Setup handoff

- [ ] Verify the latest differentiated-feature commit is present on GitHub
- [ ] Document required, optional, and placeholder environment keys
- [ ] Document fresh-clone installation, migration, testing, development, and production-start commands
