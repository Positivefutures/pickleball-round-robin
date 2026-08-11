import { readFeedbackRequest } from '../src/lib/feedback';
import { FEEDBACK_EMAIL } from '../src/lib/appInfo';

/**
 * Suggest a Feature and Report a Bug, sent for real.
 *
 * The one piece of server this app has. It exists because the Resend key is a
 * password: anything that can send mail as pbroundrobin.com has to stay out of
 * the browser bundle, so the browser posts here and this posts to Resend.
 *
 * Deployed by the same push to main that deploys the app. The only thing it
 * needs is RESEND_API_KEY, in Vercel > Settings > Environment Variables. Where
 * the mail goes is FEEDBACK_EMAIL, the same constant the rest of the app shows
 * people, so the address cannot drift into two. Without the key it answers 503
 * and the panel says so, which is a tested state rather than a crash.
 *
 * Edge rather than Node, so the handler is an ordinary Request in and Response
 * out, with no Vercel types to install and nothing to keep in step.
 */
export const config = { runtime: 'edge' };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Kept small deliberately. Sign-in codes and these reports come out of the same
 * Resend account and the same daily allowance, so a flood here is a flood that
 * stops people signing in.
 *
 * Best effort, and honest about it: an edge function is many short-lived
 * instances in many regions, so this catches a stuck retry loop or one person
 * leaning on the button rather than a determined flood. The real backstop is
 * that the key can be rotated.
 */
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;
const seen = new Map<string, number[]>();

function tooMany(who: string): boolean {
  const now = Date.now();
  const recent = (seen.get(who) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  seen.set(who, recent);

  // The map only ever holds what one warm instance has seen, but a long-lived
  // one should not grow without limit either.
  if (seen.size > 500) seen.clear();

  return recent.length > PER_WINDOW;
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Post it.' }, 405);

  const key = process.env.RESEND_API_KEY;
  // Overridable, but the defaults are the ones to run with. The from address
  // has to sit on a domain verified in Resend, which pbroundrobin.com already
  // is: it is where the sign-in codes come from.
  const to = process.env.FEEDBACK_TO ?? FEEDBACK_EMAIL;
  const from = process.env.FEEDBACK_FROM ?? 'PB Round Robin <feedback@pbroundrobin.com>';

  if (!key) {
    return json({ error: 'Sending is not set up right now. Please try again later.' }, 503);
  }

  const who =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  if (tooMany(who)) {
    return json({ error: 'That is a lot of messages at once.' }, 429);
  }

  const body = await request.json().catch(() => null);
  const read = readFeedbackRequest(body);
  if (!read.ok) return json({ error: read.reason }, 400);

  const sent = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: read.mail.subject,
      text: read.mail.text,
      // Their address when they gave one, so Reply reaches the person rather
      // than the app. Omitted entirely otherwise; Resend refuses an empty one.
      ...(read.mail.replyTo ? { reply_to: [read.mail.replyTo] } : {}),
    }),
  }).catch(() => null);

  if (!sent || !sent.ok) {
    // The detail goes to the function log, not to the person. It can carry the
    // address they typed, and there is nothing they could do with it anyway.
    console.error('resend refused', sent?.status, await sent?.text().catch(() => ''));
    return json({ error: 'That did not send. Please try again.' }, 502);
  }

  return json({ ok: true }, 200);
}
