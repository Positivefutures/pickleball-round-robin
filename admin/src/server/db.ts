/**
 * How the daily job talks to Postgres.
 *
 * One route: a direct connection to this project's database, using the
 * connection string from Supabase's Connect panel.
 *
 * **Why not a personal access token.** The first draft ran SQL through the
 * Management API, `POST /v1/projects/{ref}/database/query`, authenticated with
 * a Supabase personal access token. That worked, and it was the wrong choice.
 * A PAT carries the privileges of the whole account: every project, not this
 * one, including pausing and deleting them and reading their connection
 * strings. This job needs to read and write one database. A connection string
 * reaches exactly that database and nothing else, and it is rotatable from the
 * dashboard by changing the password.
 *
 * **Why not a service_role key.** It is project-scoped, which is the right
 * instinct, but PostgREST cannot run SQL. Everything below is either a join
 * (`readQuotas`) or a function call with arguments, and the RPC route could
 * carry neither. The earlier draft claimed to fall back to it and could not
 * have: the fallback matched only `select admin.fn()` and dropped every
 * argument, so the first real query would have thrown. That code is gone
 * rather than fixed, because this route makes it unnecessary.
 *
 * All the aggregation lives in A002_snapshot.sql and the job only ever sends
 * `select admin.something(...)`. See the header of that file for why.
 */

import postgres from 'postgres';

export interface Db {
  /** Named in the job log and the dashboard's own health row. */
  readonly route: 'postgres';
  /** Run one statement and hand back whatever it selected. */
  query<T = unknown>(sql: string): Promise<T[]>;
  /** Let the socket go. A serverless invocation that does not is one that hangs. */
  close(): Promise<void>;
}

export class DbError extends Error {
  // Written out rather than as a constructor parameter property. The tsconfig
  // sets erasableSyntaxOnly, which rules out the shorthand: it is one of the
  // few TypeScript constructs that emits runtime code rather than erasing.
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'DbError';
    this.status = status;
  }
}

/**
 * Encode a value for inlining into SQL.
 *
 * The driver has bind parameters, and they are not used, because the callers
 * here build whole statements as strings and passing them through unchanged is
 * what keeps A002 the single place the SQL lives. So anything variable is
 * embedded, and embedded in base64 rather than quoted: the base64 alphabet is
 * `A-Za-z0-9+/=` and contains no quote, no backslash and no dollar, so there is
 * nothing in an encoded value that could end the literal it sits in. That is a
 * property of the alphabet rather than of the escaping being careful, which is
 * why it is used here.
 */
export function sqlJson(value: unknown): string {
  const b64 = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  return `convert_from(decode('${b64}', 'base64'), 'utf8')::jsonb`;
}

/** The same, for a plain string argument. */
export function sqlText(value: string): string {
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  return `convert_from(decode('${b64}', 'base64'), 'utf8')`;
}

/**
 * Open a connection.
 *
 * `prepare: false` is not optional. Supabase's pooler in transaction mode hands
 * a different backend to each statement, and a prepared statement named on one
 * backend does not exist on the next. It is the standard failure of this pairing
 * and it appears as a confusing `prepared statement "s1" does not exist` on the
 * second query rather than the first.
 *
 * One connection, because the job runs a dozen statements once a day and a pool
 * would only be something else to close.
 */
export function openDb(env: NodeJS.ProcessEnv = process.env): Db {
  const url = env.SUPABASE_DB_URL;
  if (!url) {
    throw new DbError(
      'No database route configured. Set SUPABASE_DB_URL to the connection ' +
        'string from Supabase > Connect, with the password filled in.'
    );
  }

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    // Supabase terminates TLS with a certificate this does not have the chain
    // for. The connection is encrypted; it is not certificate-pinned. Anything
    // stronger means shipping their CA bundle in the lambda.
    ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  });

  return {
    route: 'postgres',
    async query<T>(statement: string): Promise<T[]> {
      try {
        const rows = await sql.unsafe(statement);
        return rows as unknown as T[];
      } catch (e) {
        throw new DbError(`Postgres said: ${(e as Error).message}`);
      }
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}
