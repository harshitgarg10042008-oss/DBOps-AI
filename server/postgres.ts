import { Client } from "pg";
import { decryptSecret } from "./crypto";
import type { DatabaseConnection } from "../drizzle/schema";

export type Catalog = {
  tables: Array<{ schema: string; name: string; type: string; columns: Array<{ name: string; dataType: string; nullable: boolean; defaultValue: string | null }> }>;
  relationships: Array<{ fromSchema: string; fromTable: string; fromColumn: string; toSchema: string; toTable: string; toColumn: string }>;
  indexes: Array<{ schema: string; table: string; name: string; definition: string }>;
  constraints: Array<{ schema: string; table: string; name: string; type: string; columns: string[] }>;
  views: Array<{ schema: string; name: string }>;
};

function toConfig(connection: DatabaseConnection) {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.databaseName,
    user: connection.username,
    password: decryptSecret(connection.encryptedPassword),
    ssl: connection.sslMode === "disable" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 8000,
    query_timeout: 9000,
  };
}

export async function withClient<T>(connection: DatabaseConnection, fn: (client: Client) => Promise<T>) {
  const client = new Client(toConfig(connection));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export type PostgresPrivilegePosture = {
  currentUser: string;
  database: string;
  isSuperuser: boolean;
  canCreateDatabase: boolean;
  canCreatePublicSchema: boolean;
  hasWriteGrants: boolean;
  readOnly: boolean;
  warnings: string[];
};

export function summarizePrivilegePosture(row: Record<string, unknown>, fallbackUser: string, fallbackDatabase: string): PostgresPrivilegePosture {
  const warnings: string[] = [];
  if (Boolean(row.is_superuser)) warnings.push("The connected role is a superuser.");
  if (Boolean(row.can_create_database)) warnings.push("The connected role can create databases.");
  if (Boolean(row.can_create_public_schema)) warnings.push("The connected role can create objects in the public schema.");
  if (Boolean(row.has_write_grants)) warnings.push("The connected role has table write privileges.");
  return {
    currentUser: String(row.current_user ?? fallbackUser),
    database: String(row.database ?? fallbackDatabase),
    isSuperuser: Boolean(row.is_superuser),
    canCreateDatabase: Boolean(row.can_create_database),
    canCreatePublicSchema: Boolean(row.can_create_public_schema),
    hasWriteGrants: Boolean(row.has_write_grants),
    readOnly: warnings.length === 0,
    warnings,
  };
}

export async function verifyPostgresConnection(connection: DatabaseConnection): Promise<PostgresPrivilegePosture> {
  return withClient(connection, async client => {
    await client.query("SELECT 1 AS ok");
    const result = await client.query(`
      SELECT
        current_user AS current_user,
        current_database() AS database,
        rolsuper AS is_superuser,
        has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_schema,
        EXISTS (
          SELECT 1
          FROM information_schema.role_table_grants
          WHERE grantee = current_user
            AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
        ) AS has_write_grants
      FROM pg_roles
      WHERE rolname = current_user
      LIMIT 1
    `);
    return summarizePrivilegePosture(result.rows[0] ?? {}, connection.username, connection.databaseName);
  });
}

export async function collectCatalog(connection: DatabaseConnection): Promise<Catalog> {
  return withClient(connection, async client => {
    const [tables, relationships, indexes, constraints, views] = await Promise.all([
      client.query(`SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name`),
      client.query(`SELECT tc.table_schema AS from_schema, tc.table_name AS from_table, kcu.column_name AS from_column, ccu.table_schema AS to_schema, ccu.table_name AS to_table, ccu.column_name AS to_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY'`),
      client.query(`SELECT schemaname AS schema, tablename AS table, indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename, indexname`),
      client.query(`SELECT tc.table_schema AS schema, tc.table_name AS table, tc.constraint_name AS name, tc.constraint_type AS type, STRING_AGG(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name WHERE tc.table_schema NOT IN ('pg_catalog', 'information_schema') GROUP BY tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type ORDER BY tc.table_schema, tc.table_name, tc.constraint_name`),
      client.query(`SELECT table_schema AS schema, table_name AS name FROM information_schema.views WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name`),
    ]);

    const tableRows = await Promise.all(tables.rows.map(async row => {
      const columns = await client.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [row.table_schema, row.table_name]);
      return {
        schema: row.table_schema,
        name: row.table_name,
        type: row.table_type,
        columns: columns.rows.map(column => ({ name: column.column_name, dataType: column.data_type, nullable: column.is_nullable === "YES", defaultValue: column.column_default ?? null })),
      };
    }));

    return {
      tables: tableRows,
      relationships: relationships.rows.map(row => ({ fromSchema: row.from_schema, fromTable: row.from_table, fromColumn: row.from_column, toSchema: row.to_schema, toTable: row.to_table, toColumn: row.to_column })),
      indexes: indexes.rows.map(row => ({ schema: row.schema, table: row.table, name: row.name, definition: row.definition })),
      constraints: constraints.rows.map(row => ({ schema: row.schema, table: row.table, name: row.name, type: row.type, columns: String(row.columns ?? "").split(",").filter(Boolean) })),
      views: views.rows.map(row => ({ schema: row.schema, name: row.name })),
    };
  });
}

export function buildBoundedReadOnlySql(sql: string, maxRows = 100) {
  if (/^\s*EXPLAIN\b/i.test(sql)) return sql;
  return `SELECT * FROM (${sql.replace(/;\s*$/, "")}) AS dbops_result LIMIT ${Math.max(1, Math.min(maxRows, 100))}`;
}

export async function executeReadOnly(connection: DatabaseConnection, sql: string, maxRows = 100) {
  return withClient(connection, async client => {
    await client.query("BEGIN READ ONLY");
    try {
      await client.query("SET LOCAL statement_timeout = '8000ms'");
      const started = Date.now();
      const boundedSql = buildBoundedReadOnlySql(sql, maxRows);
      const result = await client.query(boundedSql);
      const durationMs = Date.now() - started;
      const rows = result.rows.map(row => JSON.parse(JSON.stringify(row)));
      await client.query("ROLLBACK");
      return { rows, rowCount: result.rowCount ?? rows.length, durationMs, truncated: rows.length >= maxRows };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}
