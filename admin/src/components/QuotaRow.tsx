/**
 * One quota: what is used, against what limit, and when it runs out.
 *
 * Three states, and the third is the one most dashboards get wrong.
 *
 *   * A reading, with a bar and a runway sentence.
 *   * No reading yet, because the job has not captured this metric.
 *   * **No reading possible**, because nothing on the free plan exposes it.
 *     Vercel's bandwidth and Supabase's egress are both in this state.
 *
 * The third state gets a card that says so and links to the dashboard that does
 * know, rather than an empty bar. An empty bar beside a full one teaches you to
 * distrust both, and a quota you have quietly stopped believing is a quota that
 * is not being monitored.
 *
 * Status colour never travels alone. Every row states its percentage in words,
 * which is the mitigation the palette requires: on white, warning and serious
 * are both under 3:1.
 */

import { describe as sayRunway, project, type Reading } from '../lib/runway';
import { usedPct, type Quota } from '../lib/quota';
import { human } from '../lib/format';

const WHERE_INSTEAD: Record<string, { label: string; href: string }> = {
  vercel: { label: 'Vercel usage', href: 'https://vercel.com/account/usage' },
  supabase: { label: 'Supabase usage', href: 'https://supabase.com/dashboard/org/_/usage' },
};

function tone(pct: number): { color: string; word: string } {
  if (pct >= 90) return { color: 'var(--color-critical)', word: 'Critical' };
  if (pct >= 80) return { color: 'var(--color-serious)', word: 'Over 80%' };
  if (pct >= 50) return { color: 'var(--color-warning)', word: 'Over half' };
  return { color: 'var(--color-good)', word: 'Fine' };
}

export function QuotaRow({ quota, history }: { quota: Quota; history: Reading[] }) {
  if (!quota.available) {
    const where = WHERE_INSTEAD[quota.service];
    return (
      <li className="border-t border-[var(--color-grid)] py-3">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{label(quota.metric)}</span>
          <span className="text-sm text-[var(--color-ink-faint)]">
            limit {human(quota.ceiling, quota.unit)}
          </span>
        </p>
        <p className="m-0 mt-1 text-sm text-[var(--color-ink-quiet)]">
          Not readable on the free plan. {quota.note}{' '}
          {where && (
            <a
              className="text-[var(--color-brand-teal-dark)] underline"
              href={where.href}
              target="_blank"
              rel="noreferrer"
            >
              {where.label}
            </a>
          )}
        </p>
      </li>
    );
  }

  const pct = usedPct(quota);

  if (pct === null) {
    return (
      <li className="border-t border-[var(--color-grid)] py-3">
        <p className="m-0 font-medium">{label(quota.metric)}</p>
        <p className="m-0 mt-1 text-sm text-[var(--color-ink-quiet)]">
          Never captured. The next run should fill this in.
        </p>
      </li>
    );
  }

  const { color, word } = tone(pct);

  return (
    <li className="border-t border-[var(--color-grid)] py-3">
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{label(quota.metric)}</span>
        <span className="text-sm tnum text-[var(--color-ink-quiet)]">
          {human(quota.value ?? 0, quota.unit)} of {human(quota.ceiling, quota.unit)}
        </span>
      </p>

      <span
        className="mt-1.5 mb-1 block h-2.5 w-full overflow-hidden rounded-sm bg-[var(--color-grid)]"
        role="img"
        aria-label={`${Math.round(pct)} percent used`}
      >
        <span
          className="block h-full rounded-r-[4px]"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </span>

      {/* The word beside the colour. The bar alone would be colour carrying
          meaning on its own, which two of these four steps cannot do on white. */}
      <p className="m-0 text-sm text-[var(--color-ink-quiet)]">
        <span className="font-medium text-[var(--color-ink)] tnum">
          {pct.toFixed(pct < 10 ? 1 : 0)}%
        </span>{' '}
        · {word} · {sayRunway(project(history, quota.ceiling), quota.unit)}
      </p>
    </li>
  );
}

function label(metric: string): string {
  return (
    {
      supabase_db_bytes: 'Database size',
      supabase_mau: 'Accounts signing in this month',
      supabase_egress_bytes: 'Data sent out',
      resend_sends_day: 'Emails today',
      resend_sends_month: 'Emails this month',
      sentry_events_month: 'Crashes reported this month',
      vercel_bandwidth_bytes: 'Bandwidth',
      vercel_analytics_events: 'Analytics events',
    }[metric] ?? metric
  );
}
