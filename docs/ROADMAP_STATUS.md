# Roadmap Status

The website is implemented as a credential-independent product shell with working security primitives and honest evidence states. Authentication, workspace isolation, encrypted connection registration, connection verification, schema cataloging, natural-language proposal flow, SQL policy validation, constrained execution, evidence explanations, audit filtering/detail, dashboard telemetry, performance parsing primitives, team controls, security posture, investigation timeline, evaluation registry, settings controls, and responsive cyberpunk navigation are present.

The application intentionally does not fabricate database observations. Performance findings, security findings, query results, evaluation scores, and audit events remain empty until a real PostgreSQL endpoint and model credentials are connected. This is a product guarantee, not an unfinished fake-data layer.

| Completion area | State |
|---|---|
| Website shell and navigation | Implemented |
| Auth and workspace boundary | Implemented |
| PostgreSQL connection and schema workflow | Implemented; requires real endpoint for live evidence |
| AI proposal and explanation workflow | Implemented; requires configured model gateway for live generation |
| Read-only SQL safety | Implemented and tested |
| Audit lifecycle | Implemented and filtered/detail-ready |
| Performance parsing | Implemented for JSON plan evidence and live EXPLAIN collection during successful query execution; findings populate after connected workload data. |
| Team management | Implemented for existing workspace members; invite provisioning is intentionally credential-dependent |
| Evaluation | Implemented as benchmark registry and metric shell; scores require a real fixture run. |
| Production credential handoff | Deferred until user provides keys |

## Next credential-gated actions

After credentials are supplied, connect a restricted PostgreSQL role, refresh the schema catalog, run the proposal workflow against a fixture database, execute benchmark cases, verify audit traces, and review performance evidence. Only then should production model and database credentials be introduced.
