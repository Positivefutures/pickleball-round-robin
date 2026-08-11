export type FeedbackKind = 'feature' | 'bug';

/**
 * Everything attached to a report. Browser values are passed in rather than read
 * from `navigator`/`window` here, so this module stays pure and testable.
 */
export interface FeedbackContext {
  version: string;
  /** Which screen they were on, e.g. "3. Schedule". */
  step: string;
  groups: number;
  players: number;
  sessionActive: boolean;
  courts: number;
  rounds: number;
  largeText: boolean;
  userAgent: string;
  /** Viewport as "390x844". */
  screen: string;
  language: string;
}

export const MAX_SUMMARY = 100;
export const MAX_DETAILS = 1500;
export const MAX_EMAIL = 120;

const LABEL: Record<FeedbackKind, string> = {
  feature: 'Feature',
  bug: 'Bug',
};

/**
 * What gets attached, in the order it appears in the mail — the panel renders
 * this same list so the user can see it before sending. A bug needs the full
 * picture; on a feature suggestion the browser and viewport are just noise.
 */
export function diagnosticLines(ctx: FeedbackContext, kind: FeedbackKind): string[] {
  const lines = [`Version: ${ctx.version}`, `Screen: ${ctx.step}`];
  if (kind === 'feature') return lines;

  lines.push(
    `Groups: ${ctx.groups}`,
    `Players: ${ctx.players}`,
    `Session running: ${ctx.sessionActive ? 'yes' : 'no'}`,
    `Courts / rounds: ${ctx.courts} / ${ctx.rounds}`,
    `Large text: ${ctx.largeText ? 'on' : 'off'}`,
    `Browser: ${ctx.userAgent}`,
    `Window: ${ctx.screen}`,
    `Language: ${ctx.language}`
  );
  return lines;
}

export function buildSubject(kind: FeedbackKind, summary: string): string {
  const trimmed = summary.trim().replace(/\s+/g, ' ').slice(0, MAX_SUMMARY);
  return `[${LABEL[kind]}] ${trimmed}`;
}

export function buildBody(
  kind: FeedbackKind,
  summary: string,
  details: string,
  ctx: FeedbackContext
): string {
  const heading = kind === 'feature' ? 'The idea' : 'What happened';
  const parts = [`${heading}\n${'-'.repeat(heading.length)}\n${summary.trim()}`];

  const body = details.trim();
  if (body) parts.push(body);

  parts.push(['--- app details ---', ...diagnosticLines(ctx, kind)].join('\n'));
  return parts.join('\n\n') + '\n';
}

/**
 * encodeURIComponent rather than encodeURI: a raw `#` starts a fragment and
 * silently truncates everything after it, and `&` would start a new header.
 */
export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The full message as plain text, for the clipboard fallback. */
export function toClipboardText(to: string, subject: string, body: string): string {
  return `To: ${to}\nSubject: ${subject}\n\n${body}`;
}

// ------------------------------------------------------------------- Sending
//
// The panel posts to /api/feedback, which holds the Resend key and does the
// send. Everything below is shared by both ends of that call: one shape for the
// request, and one place where the caps are decided. The browser checks them to
// give a useful message, and the function checks them again because a public
// endpoint cannot trust anything it is handed.

/** Loose on purpose. This decides whether to set a reply-to, not whether to send. */
export function isEmailish(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** What the browser posts. */
export interface FeedbackRequest {
  kind: FeedbackKind;
  summary: string;
  details: string;
  /** Empty when they would rather not hear back. */
  replyTo: string;
  context: FeedbackContext;
}

/** The mail to hand to Resend, once a request has been found sound. */
export interface FeedbackMail {
  subject: string;
  text: string;
  /** Absent rather than empty, because Resend rejects an empty reply_to. */
  replyTo?: string;
}

const KINDS: FeedbackKind[] = ['feature', 'bug'];

/**
 * Reads a posted body into the mail it stands for, or says why not.
 *
 * Written against `unknown` because on the server this is whatever arrived over
 * the wire. Every string is cut to its cap here rather than rejected for being
 * long: a summary one character over is still worth reading.
 */
export function readFeedbackRequest(
  input: unknown
): { ok: true; mail: FeedbackMail } | { ok: false; reason: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'No message.' };
  const body = input as Record<string, unknown>;

  const kind = body.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as FeedbackKind)) {
    return { ok: false, reason: 'No message.' };
  }

  const str = (value: unknown, cap: number) =>
    typeof value === 'string' ? value.slice(0, cap) : '';

  const summary = str(body.summary, MAX_SUMMARY).trim();
  if (!summary) return { ok: false, reason: 'Tell me what it is about first.' };

  const details = str(body.details, MAX_DETAILS);
  const replyTo = str(body.replyTo, MAX_EMAIL).trim();

  // A context that did not arrive is not worth refusing over. The message is
  // the point, and diagnosticLines fills the gaps with what it was given.
  const context = (typeof body.context === 'object' && body.context !== null
    ? body.context
    : {}) as FeedbackContext;

  return {
    ok: true,
    mail: {
      subject: buildSubject(kind as FeedbackKind, summary),
      text: buildBody(kind as FeedbackKind, summary, details, context),
      ...(isEmailish(replyTo) ? { replyTo } : {}),
    },
  };
}

/** Where the browser posts. Relative, so it follows the app to any host. */
export const FEEDBACK_ENDPOINT = '/api/feedback';

/**
 * Sends a report, and says plainly whether it went.
 *
 * Never throws. The panel has no fallback behind it any more, so a failure has
 * to come back as something worth putting on screen rather than as an
 * exception that leaves the button spinning.
 */
export async function sendFeedback(request: FeedbackRequest): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (response.ok) return { ok: true };

    if (response.status === 429) {
      return { ok: false, message: 'That is a lot of messages at once. Try again in a few minutes.' };
    }

    const reason = await response
      .json()
      .then((data: { error?: unknown }) => (typeof data.error === 'string' ? data.error : null))
      .catch(() => null);

    return { ok: false, message: reason ?? 'That did not send. Please try again.' };
  } catch {
    return { ok: false, message: 'That did not send. Check your connection and try again.' };
  }
}
