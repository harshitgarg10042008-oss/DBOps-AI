# Environment and Credential Handoff

DBOps AI can be developed and reviewed without external API keys. The application uses the platform-provided server integrations for development and keeps all user-supplied credentials out of source control.

## Required later

| Secret or value | Purpose | When to add |
|---|---|---|
| LLM provider credential | Natural-language SQL proposals and evidence-grounded result explanations | After the website workflow is accepted |
| Real PostgreSQL endpoint credentials | Connection verification, schema cataloging, and read-only query execution | During integration testing |
| Production encryption key | Protect stored database credentials in a production environment | Before production deployment |

## Rules

Use the project secret-management interface rather than writing values into `.env` files or source code. Use a dedicated PostgreSQL role with no write permissions, require SSL where supported, and test the connection against a non-production database first. The UI should continue to show an explicit awaiting-evidence state when credentials are absent; it must not display fabricated database metrics, query results, recommendations, or evaluation scores.
