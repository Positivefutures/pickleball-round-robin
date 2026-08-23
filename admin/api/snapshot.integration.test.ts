/**
 * The daily job, run for real against a real Postgres.
 *
 * Skipped unless ADMIN_TEST_PG is set, so an ordinary `npm test` stays fast and
 * needs nothing installed. scripts/scratch-db.sh builds the database, applies
 * the app's nine migrations and then both admin ones, and prints the value to
 * set. Then:
 *
 *   ADMIN_TEST_PG=postgres://postgres@127.0.0.1:55432/postgres npm test
 *
 * What this catches that a unit test cannot: whether the SQL in A002 and the
 * TypeScript in snapshot.ts agree about names, argument order and return
 * shapes. Every bug found while building this file was of exactly that kind,
 * including a parameter that shadowed a column and made claim_alert throw on
 * every call.
 *
 * It uses openDb, not a stand-in. That is the point of it: the driver, the
 * statements and the schema are all the real ones, and the only thing stubbed
 * is the network to Sentry and Resend.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openDb, type Db } from '../src/server/db';
import { run } from './snapshot';

const CONN = process.env.ADMIN_TEST_PG;
const suite = CONN ? describe : describe.skip;

suite('the daily job, end to end', () => {
  // Opened in beforeAll, not here. A skipped suite still evaluates its body,
  // and openDb throws without a connection string, so building it at this level
  // fails an ordinary `npm test` on a machine with no scratch database - which
  // is every machine most of the time.
  let db: Db;
  const env: NodeJS.ProcessEnv = {
    SENTRY_AUTH_TOKEN: 'test',
    SENTRY_ORG: 'test-org',
    SENTRY_PROJECT: 'test-proj',
    RESEND_API_KEY: 'test',
    ALERT_TO: 'nobody@example.com',
  };

  const sent: { subject: string }[] = [];

  beforeAll(() => {
    db = openDb({ SUPABASE_DB_URL: CONN } as NodeJS.ProcessEnv);

    // Every outside service, answered from here. Nothing in this test reaches
    // the network, so it cannot be slow, flaky, or send Jeff an email.
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input);

      if (url.includes('sentry.io') && url.includes('stats_v2')) {
        return json({
          groups: [
            { by: { outcome: 'accepted' }, totals: { 'sum(quantity)': 4200 } },
            { by: { outcome: 'rate_limited' }, totals: { 'sum(quantity)': 7 } },
          ],
        });
      }
      if (url.includes('sentry.io') && url.includes('/issues/')) {
        return json([{ count: '12' }, { count: '3' }]);
      }
      if (url.includes('api.resend.com/emails') && url.includes('?')) {
        return json({ data: [{ created_at: new Date().toISOString(), id: 'e1' }], has_more: false });
      }
      if (url.includes('api.resend.com/emails')) {
        // The alert send.
        sent.push({ subject: 'sent' });
        return json({ id: 'sent' });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.close();
  });

  it('runs, writes metrics, and records the run', async () => {
    const result = await run(env, db);

    expect(result.ok).toBe(true);
    expect(result.external_metrics).toBeGreaterThan(0);

    const [{ n }] = await db.query<{ n: number }>(
      "select count(*)::int as n from admin.metric_daily where day = current_date"
    );
    expect(Number(n)).toBeGreaterThan(15);

    const [row] = await db.query<{ value: string }>(
      "select value::text from admin.metric_daily where day = current_date and metric = 'sentry_events_month'"
    );
    expect(Number(row.value)).toBe(4200);
  });

  it('records the run whether or not it worked', async () => {
    const [last] = await db.query<{ ok: boolean }>(
      'select ok from admin.job_run order by started_at desc limit 1'
    );
    expect(last.ok).toBe(true);
  });

  it('is safe to run twice, which is what the Hobby cron requires', async () => {
    const before = await db.query<{ n: number }>(
      "select count(*)::int as n from admin.metric_daily"
    );
    await run(env, db);
    const after = await db.query<{ n: number }>(
      "select count(*)::int as n from admin.metric_daily"
    );
    // Same rows updated, not a second set inserted.
    expect(Number(after[0].n)).toBe(Number(before[0].n));
  });

  it('sends an alert once and then stays quiet about the same crossing', async () => {
    // Drop the database size ceiling under the current reading so a crossing is
    // certain, rather than waiting for the test database to grow to 500 MB.
    await db.query(
      "update admin.quota_limit set ceiling = 1 where metric = 'supabase_db_bytes'"
    );

    // Clear any claim left by a previous run of this suite. Without this the
    // test passes the first time and fails every time after, because the
    // anti-spam rule is doing exactly its job across runs. Found by running the
    // suite twice, which is worth doing to any test that writes.
    await db.query("delete from admin.alert_sent where metric = 'supabase_db_bytes'");

    sent.length = 0;
    const first = await run(env, db);
    expect((first.alerts_sent as string[]).length).toBeGreaterThan(0);

    sent.length = 0;
    const second = await run(env, db);
    expect(second.alerts_sent).toEqual([]);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
