/**
 * The daily job. Everything the dashboard shows is written by this one file.
 *
 * Fired by Vercel Cron, once a day, which is the most a Hobby account allows.
 * Their own limits page: "Hobby accounts are limited to cron jobs that run once
 * per day", with an hour of slop on when it actually fires. Both facts are
 * designed around rather than worked around:
 *
 *   * The slop does not matter, because every metric is a daily figure and
 *     admin.record upserts on (day, metric, dimension). Fired at 03:59 instead
 *     of 03:00, it writes the same row.
 *   * Firing twice does not matter, for the same reason. So this endpoint is
 *     safe to hit by hand at any time, which is how it gets tested.
 *
 * Six steps, in an order chosen so that a failure late on still leaves the
 * dashboard better off than it was:
 *
 *   1. Snapshot the database, which is the bulk of the value and needs nobody.
 *   2. Backfill, once, if the history is empty.
 *   3. Ask Sentry, Resend and Supabase's platform API. Each may fail alone.
 *   4. Write what came back.
 *   5. Work out which quota lines have been crossed, and claim each in the
 *      database before sending anything.
 *   6. Record the run, whether or not it worked.
 *
 * Step 6 runs even when an earlier step threw. A job that fails silently is the
 * exact failure this whole dashboard exists to prevent elsewhere, and it would
 * be a poor joke to build it with that hole in the middle.
 */

import { openDb, sqlJson, type Db } from '../src/server/db';
import {
  collectResend,
  collectSentry,
  collectSupabasePlatform,
  type MetricRow,
} from '../src/server/collectors';
import { composeAlert, send } from '../src/server/notify';
import { crossings, type Quota } from '../src/lib/quota';
import { project } from '../src/lib/runway';

export const config = { runtime: 'nodejs' };

/**
 * Vercel Cron requests carry this header. Checking it stops the endpoint being
 * a button anyone on the internet can press, which matters because pressing it
 * costs Resend allowance and Sentry API calls.
 *
 * `CRON_SECRET` is set in the project's environment variables; Vercel sends it
 * as `Authorization: Bearer <secret>` on scheduled invocations. Without the
 * variable set the endpoint refuses everything rather than defaulting to open.
 */
function authorised(request: Request, env: NodeJS.ProcessEnv): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RunNote {
  step: string;
  problem: string;
}

/**
 * `into` exists so the whole job can be run against a throwaway Postgres in a
 * test, which is the only way to find out whether the SQL in A002 and the
 * TypeScript here actually agree. In production it is never passed, and the
 * route comes from the environment.
 */
export async function run(
  env: NodeJS.ProcessEnv,
  into?: Db
): Promise<Record<string, unknown>> {
  const started = Date.now();
  const notes: RunNote[] = [];
  let db: Db | null = null;
  let ok = true;

  const detail: Record<string, unknown> = {};

  try {
    db = into ?? openDb(env);
    detail.route = db.route;

    // ---- 1. The database, counting itself.
    const [snapshot] = await db.query<{ take_snapshot: unknown }>(
      'select admin.take_snapshot();'
    );
    detail.snapshot = snapshot?.take_snapshot ?? null;

    // ---- 2. Backfill, but only into an empty history.
    //
    // Guarded by a count rather than by a flag file, so it is self-correcting:
    // wipe metric_daily and the next run rebuilds it. The guard is what stops
    // 400 days of re-derivation happening every morning for no reason.
    const [{ n: existing }] = await db.query<{ n: number }>(
      "select count(*)::int as n from admin.metric_daily where day < current_date;"
    );
    if (Number(existing) === 0) {
      const [filled] = await db.query<{ backfill: unknown }>('select admin.backfill();');
      detail.backfill = filled?.backfill ?? null;
    }

    // ---- 3. The three outside services, in parallel. None can fail the run.
    const [sentry, resend, platform] = await Promise.all([
      collectSentry(env),
      collectResend(env),
      collectSupabasePlatform(env),
    ]);

    for (const [step, got] of [
      ['sentry', sentry],
      ['resend', resend],
      ['supabase-platform', platform],
    ] as const) {
      if (got.problem) notes.push({ step, problem: got.problem });
    }

    // ---- 4. Write them.
    const rows: MetricRow[] = [...sentry.rows, ...resend.rows, ...platform.rows];
    if (rows.length) {
      await db.query(
        `select admin.record_many(current_date, ${sqlJson(
          rows.map((r) => ({ metric: r.metric, dimension: r.dimension ?? '', value: r.value }))
        )});`
      );
    }
    detail.external_metrics = rows.length;

    // ---- 5. Quotas, crossings, and at most a handful of emails.
    const quotas = await readQuotas(db);
    const now = new Date();
    const sent: string[] = [];

    for (const crossing of crossings(quotas, now)) {
      const { quota, threshold, periodKey } = crossing;

      // Claim before sending. If this returns false somebody or something has
      // already reported this crossing in this period, and the mail is not sent.
      const [claim] = await db.query<{ claim_alert: boolean }>(
        `select admin.claim_alert(${lit(quota.metric)}, ${threshold}, ${lit(periodKey)}, ` +
          `${Number(quota.value)}, ${Number(quota.ceiling)});`
      );
      if (!claim?.claim_alert) continue;

      const history = await readHistory(db, quota.metric);
      const mail = composeAlert(crossing, project(history, quota.ceiling));
      const result = await send(mail, env);

      if (result.sent) {
        sent.push(`${quota.metric}@${threshold}`);
      } else {
        // The claim is deliberately not rolled back. Retrying an alert every
        // morning after a transient Resend failure is the spam this design is
        // built to avoid, and the crossing is visible on the dashboard anyway.
        notes.push({ step: 'alert', problem: `${quota.metric}: ${result.problem}` });
      }
    }
    detail.alerts_sent = sent;
  } catch (e) {
    ok = false;
    notes.push({ step: 'run', problem: (e as Error).message });
  }

  // ---- 6. Always.
  detail.notes = notes;
  const ms = Date.now() - started;

  if (db) {
    try {
      await db.query(
        `select admin.finish_run(${ok}, ${sqlJson({ notes, ...detail })}, ${ms});`
      );
    } catch {
      // Nothing useful left to do. The response still carries the truth.
    }
  }

  return { ok, ms, ...detail };
}

/** A numeric or text literal, base64 encoded. See sqlJson for why. */
function lit(value: string): string {
  return `convert_from(decode('${Buffer.from(value, 'utf8').toString('base64')}', 'base64'), 'utf8')`;
}

async function readQuotas(db: Db): Promise<Quota[]> {
  const rows = await db.query<Record<string, unknown>>(`
    select q.metric, q.service, q.ceiling, q.unit, q.period, q.available, q.note,
           latest.value, latest.day as as_of
    from admin.quota_limit q
    left join lateral (
      select m.value, m.day from admin.metric_daily m
      where m.metric = q.metric and m.dimension = ''
      order by m.day desc limit 1
    ) latest on true;
  `);

  return rows.map((r) => ({
    metric: String(r.metric),
    service: String(r.service),
    ceiling: Number(r.ceiling),
    unit: String(r.unit),
    period: r.period as Quota['period'],
    available: Boolean(r.available),
    note: r.note === null || r.note === undefined ? null : String(r.note),
    value: r.value === null || r.value === undefined ? null : Number(r.value),
    asOf: r.as_of === null || r.as_of === undefined ? null : String(r.as_of),
  }));
}

async function readHistory(db: Db, metric: string): Promise<{ day: string; value: number }[]> {
  const rows = await db.query<{ day: string; value: string }>(
    `select day::text as day, value from admin.metric_daily
      where metric = ${lit(metric)} and dimension = ''
      order by day desc limit 60;`
  );
  return rows.map((r) => ({ day: r.day, value: Number(r.value) })).reverse();
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorised(request, process.env)) {
    return json({ error: 'Not permitted.' }, 401);
  }
  const result = await run(process.env);
  return json(result, result.ok ? 200 : 500);
}
