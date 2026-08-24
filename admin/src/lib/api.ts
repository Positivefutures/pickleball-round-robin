/**
 * The browser's whole view of the database: four functions, all gated.
 *
 * The client here holds the publishable key, exactly as the main app's does,
 * and exactly as harmlessly. It is not what protects anything. What protects
 * the admin schema is that every function below refuses a caller whose JWT
 * email is not in admin.allowlist, and that check runs in Postgres. Editing
 * this file, or the bundle it compiles to, changes nothing about who can read
 * what. See the header of A001_admin_schema.sql.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const NOT_CONFIGURED =
  'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. See .env.example.';

/**
 * Why `supabase()` would throw, or null if it would not.
 *
 * Split out from the client so that a render may ask the question. It reads
 * two variables Vite has already baked into the bundle and builds nothing, so
 * it is pure, it cannot change while the tab is open, and calling it twice
 * costs nothing. `supabase()` itself is not pure — it memoises a client on
 * first call — which is why App.tsx settles this here rather than by catching.
 */
export function configProblem(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? null : NOT_CONFIGURED;
}

export function supabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(NOT_CONFIGURED);
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

export interface MetricPoint {
  day: string;
  metric: string;
  dimension: string;
  value: number;
}

export interface QuotaRow {
  metric: string;
  service: string;
  ceiling: number;
  unit: string;
  period: 'daily' | 'monthly' | 'absolute';
  available: boolean;
  note: string | null;
  value: number | null;
  as_of: string | null;
}

export interface JobRun {
  started_at: string;
  ok: boolean | null;
  ms: number | null;
  detail: { notes?: { step: string; problem: string }[] } | null;
}

export interface AlertRow {
  metric: string;
  threshold: number;
  period_key: string;
  value: number | null;
  ceiling: number | null;
  sent_at: string;
}

/**
 * A refusal from the gate arrives as a Postgres exception, which supabase-js
 * surfaces as an ordinary error. Turning it into one recognisable shape here
 * means the page can say "this account is not on the allowlist" rather than
 * showing a raw SQL error to the one person who does not need to see one.
 */
export class NotPermitted extends Error {}

/**
 * A token the server will not take, which signing in again would replace.
 *
 * PostgREST checks the `iat` and `exp` claims against its own clock and allows
 * no skew at all, so a token stamped a second into the future is refused for
 * as long as it is held. `persistSession` keeps it in the device's storage, so
 * it does not age out of the problem on its own: the tab goes on presenting
 * the same rejected token every time it is opened.
 *
 * Worth its own shape because the wording the server uses is no use to the
 * person reading it. "JWT issued at future" is a true and complete description
 * of a condition whose entire remedy is to sign in again, which is what the
 * page says instead. The server's own words are kept on the error so the panel
 * can still show them in small print.
 */
export class StaleSession extends Error {}

/**
 * What the server calls a token it will not accept.
 *
 * The optional `error` is not decoration: PostgREST reports a bad signature as
 * "JWSError JWSInvalidSignature", where the letters run straight into the next
 * word and a plain \b after them never matches. The test caught that.
 */
const STALE = /\bjw[st](?:error)?\b|token is expired|invalid claim/i;

/** PostgREST's codes for an expired and a missing-claim token. */
const STALE_CODES = ['PGRST301', 'PGRST302'];

/**
 * Whether a refusal is about the token rather than about the request.
 *
 * Exported so it can be tested against the real wordings rather than guessed
 * at, because both ways of being wrong cost something. Miss one and the reader
 * is back to reading "JWT issued at future". Match too much and the page tells
 * them to sign in again over a fault that signing in will not touch, which is
 * worse: it hides a real error behind a confident wrong instruction.
 */
export function looksStale(message: string, code?: string): boolean {
  return STALE.test(message) || (code !== undefined && STALE_CODES.includes(code));
}

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const { message, code } = res.error;
    // The allowlist refusal is checked first: it is a deliberate Postgres
    // exception and must not be mistaken for anything the token did wrong.
    if (/not permitted/i.test(message)) throw new NotPermitted(message);
    if (looksStale(message, code)) throw new StaleSession(message);
    throw new Error(message);
  }
  return (res.data ?? []) as T;
}

export async function fetchMetrics(since: string, until: string): Promise<MetricPoint[]> {
  const rows = unwrap(
    await supabase().rpc('admin_metrics', { since, until })
  ) as (Omit<MetricPoint, 'value'> & { value: string | number })[];
  // numeric comes back from PostgREST as a string, on purpose, to keep
  // precision. Every one of these is a count or a byte figure well inside
  // Number's safe range, so converting once here beats doing it at each chart.
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

export async function fetchQuotas(): Promise<QuotaRow[]> {
  const rows = unwrap(await supabase().rpc('admin_quotas')) as Record<string, unknown>[];
  return rows.map((r) => ({
    metric: String(r.metric),
    service: String(r.service),
    ceiling: Number(r.ceiling),
    unit: String(r.unit),
    period: r.period as QuotaRow['period'],
    available: Boolean(r.available),
    note: r.note == null ? null : String(r.note),
    value: r.value == null ? null : Number(r.value),
    as_of: r.as_of == null ? null : String(r.as_of),
  }));
}

export async function fetchJobRuns(): Promise<JobRun[]> {
  return unwrap(await supabase().rpc('admin_job_runs', { limit_to: 14 })) as JobRun[];
}

export async function fetchAlerts(): Promise<AlertRow[]> {
  return unwrap(await supabase().rpc('admin_alerts', { limit_to: 25 })) as AlertRow[];
}

/** Pull one metric's series out of the flat result, ready for a chart. */
export function series(points: MetricPoint[], metric: string, dimension = ''): MetricPoint[] {
  return points.filter((p) => p.metric === metric && p.dimension === dimension);
}

/** The most recent value of a metric, or null if it has never been captured. */
export function latest(points: MetricPoint[], metric: string, dimension = ''): number | null {
  const s = series(points, metric, dimension);
  return s.length ? s[s.length - 1].value : null;
}

/** Today's distribution for a banded metric, in band order rather than alphabetical. */
export function distribution(points: MetricPoint[], metric: string): { band: string; value: number }[] {
  const order = ['0', '1-4', '5-8', '9-12', '13-16', '17-20', '21-32', '33+'];
  const day = points
    .filter((p) => p.metric === metric)
    .reduce<string>((max, p) => (p.day > max ? p.day : max), '');
  return points
    .filter((p) => p.metric === metric && p.day === day)
    .map((p) => ({ band: p.dimension, value: p.value }))
    .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band));
}
