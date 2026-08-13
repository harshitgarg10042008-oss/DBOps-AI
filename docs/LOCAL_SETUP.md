# DBOps AI: Local Setup and Environment Handoff

## GitHub source

The latest differentiated-feature implementation is on the `main` branch of [harshitgarg10042008-oss/DBOps-AI](https://github.com/harshitgarg10042008-oss/DBOps-AI). The verified commit is `6199ab8`.

## 1. Clone and install

```bash
git clone https://github.com/harshitgarg10042008-oss/DBOps-AI.git
cd DBOps-AI
pnpm install
```

Use Node.js 22 or a compatible current LTS release, and pnpm 10 or newer.

## 2. Environment variables

Create a local environment file using the variable names below. Never commit `.env` files or real credentials.

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | Application database connection. This is the MySQL/TiDB database used by Drizzle for users, workspaces, audit events, proposals, executions, policies, and contracts. It is not the user-connected PostgreSQL database. |
| `JWT_SECRET` | Yes | Signs authenticated session cookies. Use a long random value. |
| `VITE_APP_ID` | Yes | Manus OAuth application identifier. |
| `OAUTH_SERVER_URL` | Yes | OAuth backend base URL. |
| `VITE_OAUTH_PORTAL_URL` | Yes | Frontend login portal URL. |
| `BUILT_IN_FORGE_API_URL` | Yes for AI features | Server-side Manus built-in API URL used for LLM and related platform services. |
| `BUILT_IN_FORGE_API_KEY` | Yes for AI features | Server-side key for the built-in API gateway. |
| `VITE_FRONTEND_FORGE_API_URL` | Yes for frontend platform features | Frontend built-in API URL. |
| `VITE_FRONTEND_FORGE_API_KEY` | Yes for frontend platform features | Frontend built-in API key. |
| `OWNER_OPEN_ID` | Yes | Owner identity used to assign the initial admin role. |
| `OWNER_NAME` | Yes | Display name for the project owner. |
| `PORT` | No | Local server port. Defaults to the managed runtime port when omitted; `3000` is recommended locally. |
| `VITE_ANALYTICS_ENDPOINT` | No | Analytics endpoint. Leave empty to disable analytics. |
| `VITE_ANALYTICS_WEBSITE_ID` | No | Analytics website identifier. Leave empty to disable analytics. |
| `VITE_APP_TITLE` | No | Optional application title override. |
| `VITE_APP_LOGO` | No | Optional application logo override. |

The platform-provided development environment already injects many of these values. A standalone clone outside the managed platform needs valid values from the corresponding OAuth and built-in API configuration.

## 3. Database migration

The application database is the MySQL/TiDB database specified by `DATABASE_URL`. Run the existing migrations against a new or dedicated development database:

```bash
pnpm drizzle-kit migrate
```

If the migration files have changed during development, generate and review a new migration before applying it:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Do not point a first local run at a production database.

## 4. Validate the installation

```bash
pnpm check
pnpm test
pnpm build
```

The current project has three Vitest files and 22 passing tests in the verified development checkpoint.

## 5. Start the development server

```bash
PORT=3000 pnpm dev
```

Open `http://localhost:3000`. The OAuth callback URL must be registered in the OAuth application configuration for the local origin. If the OAuth provider only permits the managed Manus preview URL, use the managed preview instead of standalone local OAuth.

## 6. Start the production build locally

```bash
pnpm build
PORT=3000 pnpm start
```

Open `http://localhost:3000` after the server starts.

## 7. Connect a PostgreSQL database inside DBOps AI

PostgreSQL credentials are intentionally **not environment variables**. After signing in, use **Add database** in the application and enter the PostgreSQL host, port, database name, username, password, and SSL mode. The platform encrypts the stored password server-side.

Use a dedicated PostgreSQL role with read-only privileges. The application itself also enforces read-only SQL policy, statement timeouts, result limits, identifier checks, EXPLAIN-based Cost Guard review, and audit recording.

A suitable development role should have access only to the schemas and tables needed for cataloging and read-only querying. Do not use a PostgreSQL superuser.

## 8. What requires credentials at the end

There are two separate credential handoffs:

1. **Platform/API configuration:** OAuth and built-in LLM API values listed above. These enable authentication and natural-language SQL generation.
2. **Database connection configuration:** A restricted PostgreSQL test database entered through the UI. This enables live schema catalogs, query execution, EXPLAIN plans, security posture checks, drift detection, blast-radius analysis, replay history, and contract verification.

The repository contains no real API keys and should remain safe to share.
