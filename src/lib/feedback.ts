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
