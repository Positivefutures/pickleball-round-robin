/**
 * The three things Postgres cannot count for itself.
 *
 * Every collector returns metric rows and never throws. A dashboard that goes
 * blank because Sentry was slow is worse than one that shows yesterday's Sentry
 * number next to today's everything else, so each one catches its own failure
 * and reports it as a note on the run. The job records what worked and what did
 * not, and the page shows that row at the top.
 *
 * Verified against the services' documented APIs on 2026-08-18. Two of the
 * three carry a caveat that can only be settled with a real key, and both are
 * written down at the point they matter rather than in a separate list.
 */

export interface MetricRow {
  metric: string;
  dimension?: string;
  value: number;
}

export interface Collected {
  rows: MetricRow[];
  /** Empty when it worked. One short sentence when it did not. */
  problem?: string;
}

const ok = (rows: MetricRow[]): Collected => ({ rows });
const failed = (problem: string): Collected => ({ rows: [], problem });

/** Nothing here is worth hanging the daily job on. */
const TIMEOUT_MS = 15_000;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'pbrr-admin/0.1', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------- Sentry --
//
// stats_v2 groups by `outcome`, and `accepted` is the one that counts against
// the 5,000 a month on the free Developer plan. `rate_limited` is worth having
// too: it is what being over the ceiling looks like from the inside, and it is
// the difference between "no crashes this week" and "no crashes reported this
// week", which are not at all the same news.
//
// Needs org:read. See the token table in PLANS/admin-dashboard.md.

interface StatsV2 {
  groups?: { by?: { outcome?: string }; totals?: Record<string, number> }[];
}

export async function collectSentry(env: NodeJS.ProcessEnv): Promise<Collected> {
  const token = env.SENTRY_AUTH_TOKEN;
  const org = env.SENTRY_ORG;
  if (!token || !org) return failed('Sentry is not configured.');

  try {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const url =
      `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/stats_v2/` +
      `?field=sum(quantity)&category=error&groupBy=outcome&interval=1d` +
      `&start=${since.toISOString()}&end=${new Date().toISOString()}`;

    const body = (await getJson(url, { Authorization: `Bearer ${token}` })) as StatsV2;

    const byOutcome = new Map<string, number>();
    for (const g of body.groups ?? []) {
      const outcome = g.by?.outcome ?? 'unknown';
      const total = g.totals?.['sum(quantity)'] ?? 0;
      byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + total);
    }

    const rows: MetricRow[] = [
      { metric: 'sentry_events_month', value: byOutcome.get('accepted') ?? 0 },
      { metric: 'sentry_dropped_month', value: byOutcome.get('rate_limited') ?? 0 },
    ];

    // Open issues, so the dashboard can answer "what is erroring" and not only
    // "how much". `is:unresolved` matches what the Sentry inbox shows.
    const project = env.SENTRY_PROJECT;
    if (project) {
      const issues = (await getJson(
        `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/` +
          `${encodeURIComponent(project)}/issues/?query=is:unresolved&statsPeriod=14d`,
        { Authorization: `Bearer ${token}` }
      )) as { count?: string }[];

      rows.push({ metric: 'sentry_open_issues', value: issues.length });
      rows.push({
        metric: 'sentry_open_events_14d',
        value: issues.reduce((t, i) => t + Number(i.count ?? 0), 0),
      });
    }

    return ok(rows);
  } catch (e) {
    return failed(`Sentry: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------- Resend --
//
// There is no usage endpoint, which the brief guessed correctly. But `GET
// /emails` lists sends with created_at and cursor pagination, so counting them
// is a loop rather than a table of our own.
//
// **The caveat, and it is a real one.** Sign-in codes reach Resend as Supabase's
// SMTP relay, not through the Resend API, and SMTP sends may not appear in this
// listing at all. If they do not, this counts feedback mail and misses the codes,
// which are the whole reason the 100 a day matters. `resend_listing_complete`
// is recorded alongside so the dashboard can say which of the two it is showing
// rather than quietly showing the wrong one.
//
// Settling it takes one call with a real key. Until then the number is labelled
// on the page as possibly partial.

interface ResendList {
  data?: { created_at?: string }[];
  has_more?: boolean;
}

export async function collectResend(env: NodeJS.ProcessEnv): Promise<Collected> {
  const key = env.RESEND_API_KEY;
  if (!key) return failed('Resend is not configured.');

  try {
    const now = new Date();
    const dayAgo = now.getTime() - 86_400_000;
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

    let day = 0;
    let month = 0;
    let after: string | undefined;
    let pages = 0;

    // The month is the longest we ever need to look back, and the daily cap is
    // 100, so this terminates quickly in practice. The page bound is there so a
    // surprise in the API's paging cannot turn the daily job into a loop that
    // burns the function's whole execution budget.
    while (pages < 40) {
      const url = new URL('https://api.resend.com/emails');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);

      const body = (await getJson(url.toString(), {
        Authorization: `Bearer ${key}`,
      })) as ResendList;

      const rows = body.data ?? [];
      if (rows.length === 0) break;

      let ranPastMonth = false;
      for (const row of rows) {
        const at = Date.parse(row.created_at ?? '');
        if (!Number.isFinite(at)) continue;
        if (at < monthStart) {
          ranPastMonth = true;
          continue;
        }
        month += 1;
        if (at >= dayAgo) day += 1;
      }

      pages += 1;
      if (ranPastMonth || !body.has_more) break;
      after = (rows[rows.length - 1] as { id?: string }).id;
      if (!after) break;
    }

    return ok([
      { metric: 'resend_sends_day', value: day },
      { metric: 'resend_sends_month', value: month },
      // 1 while it is unproven that SMTP relay sends appear here. Flipped to 0
      // and this row deleted once the check in PLANS/admin-dashboard.md is done.
      { metric: 'resend_listing_may_be_partial', value: 1 },
    ]);
  } catch (e) {
    return failed(`Resend: ${(e as Error).message}`);
  }
}

// ------------------------------ Supabase, and why it is not collected here --
//
// There used to be a third collector, asking the Management API whether the
// project was in read-only mode and whether its services were healthy. It is
// gone, and the reason is worth keeping.
//
// It needed a Supabase personal access token, and a personal access token
// carries the privileges of the whole account: every project, including
// pausing and deleting them. That is a very large key for two small facts.
// One of them, read-only mode, is now read straight from the session in
// api/snapshot.ts, which is a better measurement anyway because it is taken
// from inside the connection the app's writes also travel down. The other,
// whether the database is up, is answered by the snapshot returning at all.
//
// The service health of auth and storage is genuinely lost. If that ever
// matters more than the key costs, it comes back - but it should come back as
// a deliberate trade, not as a token nobody re-examined.
