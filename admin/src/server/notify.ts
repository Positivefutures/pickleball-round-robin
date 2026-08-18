/**
 * The alert email.
 *
 * Sent through Resend, to jeff@positivefutures.com, from the domain the app
 * already sends sign-in codes on.
 *
 * **These come out of the same 100 a day as the sign-in codes.** That is the
 * governing constraint on this file and the reason nothing here is chatty. The
 * design allows at most eight alerts to exist in a month, one per quota per
 * threshold, and the database refuses to let any of them be sent twice. See
 * admin.claim_alert in A002_snapshot.sql.
 *
 * The subject line carries the number, so the notification on a phone answers
 * the question without the mail being opened. That is most of the value.
 */

import type { Crossing } from '../lib/quota';
import { describe as sayRunway, type Runway } from '../lib/runway';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface AlertMail {
  subject: string;
  text: string;
}

/** Bytes, or a plain number, in whatever reads best at that size. */
export function human(value: number, unit: string): string {
  if (unit !== 'bytes') return `${Math.round(value).toLocaleString()} ${unit}`;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/**
 * One email per crossing rather than a digest of several.
 *
 * Deliberate, and the opposite of the choice made for Sentry. A quota crossing
 * is rare, it is actionable, and which one it was belongs in the subject line.
 * Batching two of them into "2 quota alerts" would put the useful part inside
 * the mail, where a phone will not show it.
 */
export function composeAlert(crossing: Crossing, runway: Runway): AlertMail {
  const { quota, threshold, pct } = crossing;
  const used = quota.value === null ? 'unknown' : human(quota.value, quota.unit);
  const of = human(quota.ceiling, quota.unit);

  const subject = `${quota.service} ${quota.metric} is at ${Math.round(pct)}% (${used} of ${of})`;

  const lines = [
    `${quota.metric} has passed ${threshold}% of its limit.`,
    '',
    `Service   ${quota.service}`,
    `Using     ${used}`,
    `Limit     ${of} (${quota.period})`,
    `At        ${pct.toFixed(1)}%`,
    '',
    `Runway    ${sayRunway(runway, quota.unit)}`,
  ];

  if (quota.note) lines.push('', quota.note);

  lines.push(
    '',
    'This is sent once per threshold per period, so you will not get it again',
    'for this one. Alerts come out of the same Resend allowance as the sign-in',
    'codes, which is why there are so few of them.'
  );

  return { subject, text: lines.join('\n') };
}

export interface SendResult {
  sent: boolean;
  problem?: string;
}

export async function send(mail: AlertMail, env: NodeJS.ProcessEnv): Promise<SendResult> {
  const key = env.RESEND_API_KEY;
  if (!key) return { sent: false, problem: 'No Resend key, so nothing was sent.' };

  const to = env.ALERT_TO ?? 'jeff@positivefutures.com';
  const from = env.ALERT_FROM ?? 'PB Round Robin <admin@pbroundrobin.com>';

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'pbrr-admin/0.1',
      },
      body: JSON.stringify({ from, to, subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { sent: false, problem: `Resend said ${res.status}.` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, problem: `Resend: ${(e as Error).message}` };
  }
}
