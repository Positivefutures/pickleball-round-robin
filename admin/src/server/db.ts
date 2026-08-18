/**
 * How the daily job talks to Postgres.
 *
 * Two routes, and the preferred one is the one that needs no service_role key.
 *
 * **The Management API**, `POST /v1/projects/{ref}/database/query`, runs SQL as
 * the project owner using a Supabase personal access token. That token is
 * account-wide and powerful, but it lives in one place, it is rotatable from a
 * page that lists it, and choosing it means no service_role key has to be
 * minted at all. A service_role key is a total bypass of every policy in
 * 0001..0009, and the fewer of those that exist, the better.
 *
 * **A service_role key** is the fallback, used only if SUPABASE_SERVICE_ROLE_KEY
 * is set and the token is not. It exists because the query endpoint's
 * availability on the free plan is the one thing in this design I could not
 * verify without Jeff's credentials, and a job that cannot run is worse than a
 * job that runs the second-best way. Delete the fallback once the first route
 * is confirmed working.
 *
 * Either way the job only ever sends `select admin.something(...)`. All the
 * aggregation lives in A002_snapshot.sql. See the header of that file for why.
 */

const MANAGEMENT = 'https://api.supabase.com/api/v1';

export interface Db {
  /** Which route is in use, for the job log and the dashboard's own health row. */
  readonly route: 'management-api' | 'service-role';
  /** Run one statement and hand back whatever it selected. */
  query<T = unknown>(sql: string): Promise<T[]>;
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
 * The Management API takes a SQL string and offers no bind parameters, so
 * anything variable has to be embedded. Rather than escape quotes, which is the
 * approach that eventually gets one case wrong, values go in base64 and come
 * back out in Postgres. The base64 alphabet is `A-Za-z0-9+/=` and contains no
 * quote, no backslash and no dollar, so there is nothing in an encoded value
 * that could end the literal it sits in. That is a property of the alphabet
 * rather than of the escaping being careful, which is why it is used here.
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

function managementDb(token: string, ref: string): Db {
  return {
    route: 'management-api',
    async query<T>(sql: string): Promise<T[]> {
      const res = await fetch(`${MANAGEMENT}/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'pbrr-admin/0.1',
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new DbError(
          `Management API said ${res.status}. ${detail.slice(0, 300)}`,
          res.status
        );
      }

      // The endpoint returns the rows of the last statement as a bare array.
      const body = (await res.json()) as unknown;
      return (Array.isArray(body) ? body : []) as T[];
    },
  };
}

function serviceRoleDb(url: string, key: string): Db {
  return {
    route: 'service-role',
    async query<T>(sql: string): Promise<T[]> {
      // PostgREST cannot run arbitrary SQL, which is a feature rather than a
      // gap. This route therefore only supports the shape the job actually
      // uses: a single `select admin.fn(args)` call, turned into an RPC.
      const call = /^\s*select\s+admin\.([a-z_]+)\s*\((.*)\)\s*;?\s*$/is.exec(sql);
      if (!call) {
        throw new DbError(
          'The service_role fallback can only call admin functions, not run SQL. ' +
            'Set SUPABASE_ACCESS_TOKEN to use the Management API route.'
        );
      }

      // This route needs `admin` added to Settings > API > Exposed schemas in
      // the Supabase dashboard, which the Management API route does not.
      //
      // Doing so is safe, and worth understanding rather than taking on trust.
      // PostgREST connects as anon or authenticated, and A001 revokes USAGE on
      // the schema from both. Exposing a schema tells PostgREST it may route to
      // it; it does not grant anything. The tables stay unreachable, and this
      // key gets in because service_role is not either of those roles.
      const res = await fetch(`${url}/rest/v1/rpc/${call[1]}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'admin',
          'Accept-Profile': 'admin',
        },
        body: '{}',
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new DbError(`PostgREST said ${res.status}. ${detail.slice(0, 300)}`, res.status);
      }
      const body = (await res.json()) as unknown;
      return (Array.isArray(body) ? body : [body]) as T[];
    },
  };
}

/**
 * Pick a route from the environment. Throws rather than returning a broken
 * client, because a job that half works is the thing this whole dashboard
 * exists to stop happening elsewhere.
 */
export function openDb(env: NodeJS.ProcessEnv = process.env): Db {
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref = env.SUPABASE_PROJECT_REF;
  if (token && ref) return managementDb(token, ref);

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return serviceRoleDb(url, key);

  throw new DbError(
    'No database route configured. Set SUPABASE_ACCESS_TOKEN and ' +
      'SUPABASE_PROJECT_REF (preferred), or SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY.'
  );
}
