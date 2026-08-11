import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildSubject,
  buildBody,
  diagnosticLines,
  mailtoUrl,
  toClipboardText,
  readFeedbackRequest,
  sendFeedback,
  FEEDBACK_ENDPOINT,
  MAX_SUMMARY,
  MAX_DETAILS,
  type FeedbackContext,
} from './feedback';

const ctx: FeedbackContext = {
  version: '1.10.0',
  step: '3. Schedule',
  groups: 3,
  players: 28,
  sessionActive: true,
  courts: 3,
  rounds: 8,
  largeText: false,
  userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1',
  screen: '390x844',
  language: 'en-US',
};

describe('buildSubject', () => {
  it('prefixes by kind', () => {
    expect(buildSubject('feature', 'Add a timer')).toBe('[Feature] Add a timer');
    expect(buildSubject('bug', 'Wrong sit-outs')).toBe('[Bug] Wrong sit-outs');
  });

  it('collapses whitespace and trims', () => {
    expect(buildSubject('bug', '  two   spaces  ')).toBe('[Bug] two spaces');
  });

  it('caps a long summary so the mailto stays under client limits', () => {
    const subject = buildSubject('bug', 'x'.repeat(500));
    expect(subject.length).toBe('[Bug] '.length + MAX_SUMMARY);
  });
});

describe('diagnosticLines', () => {
  it('gives a feature only the version and screen', () => {
    expect(diagnosticLines(ctx, 'feature')).toEqual([
      'Version: 1.10.0',
      'Screen: 3. Schedule',
    ]);
  });

  it('gives a bug the full picture', () => {
    const lines = diagnosticLines(ctx, 'bug');
    expect(lines).toContain('Groups: 3');
    expect(lines).toContain('Players: 28');
    expect(lines).toContain('Session running: yes');
    expect(lines).toContain('Courts / rounds: 3 / 8');
    expect(lines).toContain('Large text: off');
    expect(lines).toContain('Window: 390x844');
    expect(lines.some((l) => l.startsWith('Browser: Mozilla'))).toBe(true);
  });
});

describe('buildBody', () => {
  it('leads with the summary under a kind-specific heading', () => {
    expect(buildBody('feature', 'Add a timer', '', ctx)).toContain('The idea');
    expect(buildBody('bug', 'It broke', '', ctx)).toContain('What happened');
  });

  it('includes the summary, the details, and the app block', () => {
    const body = buildBody('bug', 'Wrong sit-outs', 'I removed Sue,\nthen round 3 broke.', ctx);
    expect(body).toContain('Wrong sit-outs');
    expect(body).toContain('I removed Sue,\nthen round 3 broke.');
    expect(body).toContain('--- app details ---');
    expect(body).toContain('Version: 1.10.0');
  });

  it('omits the details section entirely when it is blank', () => {
    const body = buildBody('feature', 'Add a timer', '   ', ctx);
    expect(body).not.toMatch(/\n\n\n/);
  });

  it('keeps browser details out of a feature suggestion', () => {
    expect(buildBody('feature', 'Add a timer', '', ctx)).not.toContain('Browser:');
  });
});

describe('mailtoUrl', () => {
  it('encodes characters that would truncate or split the mail', () => {
    const url = mailtoUrl('to@example.com', '[Bug] A & B #3', 'line one\nline two');
    expect(url).toContain('%23'); // # would otherwise start a URL fragment
    expect(url).toContain('%26'); // & would otherwise start a new header
    expect(url).toContain('%0A'); // newline survives
    expect(url).not.toMatch(/[#]/);
  });

  it('keeps the address readable and the params in order', () => {
    expect(mailtoUrl('a@b.com', 'S', 'B')).toBe('mailto:a@b.com?subject=S&body=B');
  });
});

describe('toClipboardText', () => {
  it('reads as a message someone could paste anywhere', () => {
    expect(toClipboardText('a@b.com', '[Bug] X', 'Body here')).toBe(
      'To: a@b.com\nSubject: [Bug] X\n\nBody here'
    );
  });
});

// ------------------------------------------------------------------- Sending

describe('readFeedbackRequest', () => {
  const sound = { kind: 'bug', summary: 'Wrong sit-outs', details: 'Round 3', replyTo: '', context: ctx };

  it('turns a sound request into the mail to send', () => {
    const read = readFeedbackRequest(sound);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.mail.subject).toBe('[Bug] Wrong sit-outs');
    expect(read.mail.text).toContain('Round 3');
  });

  it('turns an address into a reply-to, so Reply reaches the person', () => {
    const read = readFeedbackRequest({ ...sound, replyTo: ' someone@example.com ' });
    expect(read.ok && read.mail.replyTo).toBe('someone@example.com');
  });

  it('leaves reply-to off entirely rather than empty, which Resend refuses', () => {
    const read = readFeedbackRequest(sound);
    expect(read.ok && 'replyTo' in read.mail).toBe(false);
  });

  it('sends anyway when the address is not one, rather than losing the report', () => {
    // Somebody typing "yes please" into the box has still told me something.
    const read = readFeedbackRequest({ ...sound, replyTo: 'yes please' });
    expect(read.ok).toBe(true);
    expect(read.ok && 'replyTo' in read.mail).toBe(false);
  });

  it('refuses a request with nothing in it', () => {
    expect(readFeedbackRequest({ ...sound, summary: '   ' }).ok).toBe(false);
    expect(readFeedbackRequest(null).ok).toBe(false);
    expect(readFeedbackRequest('a string').ok).toBe(false);
  });

  it('refuses a kind it does not have copy for', () => {
    expect(readFeedbackRequest({ ...sound, kind: 'complaint' }).ok).toBe(false);
  });

  it('cuts what it is handed to size rather than refusing it', () => {
    // The caps are the point: this is a public endpoint, and a megabyte of
    // details would be sent to me verbatim otherwise.
    const read = readFeedbackRequest({
      ...sound,
      summary: 'x'.repeat(5000),
      details: 'y'.repeat(50_000),
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.mail.subject.length).toBe('[Bug] '.length + MAX_SUMMARY);
    expect(read.mail.text.length).toBeLessThan(MAX_SUMMARY + MAX_DETAILS + 2000);
  });

  it('still sends when the context did not arrive', () => {
    const read = readFeedbackRequest({ kind: 'feature', summary: 'A timer' });
    expect(read.ok).toBe(true);
    expect(read.ok && read.mail.subject).toBe('[Feature] A timer');
  });
});

describe('sendFeedback', () => {
  const request = {
    kind: 'feature' as const,
    summary: 'A timer',
    details: '',
    replyTo: '',
    context: ctx,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the report to the endpoint as JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendFeedback(request)).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FEEDBACK_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).summary).toBe('A timer');
  });

  it('says so plainly when the network is not there, rather than throwing', async () => {
    // The panel has no clipboard fallback behind it any more, so a thrown
    // error would leave the button saying "Sending..." for good.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const result = await sendFeedback(request);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('connection');
  });

  it('has its own words for being asked to slow down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    const result = await sendFeedback(request);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('few minutes');
  });

  it('passes on the reason the server gave, when it gave one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Sending is not set up right now.' }), { status: 503 })
    ));
    expect((await sendFeedback(request)).message).toBe('Sending is not set up right now.');
  });

  it('falls back to its own words when the server said nothing useful', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    const result = await sendFeedback(request);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('That did not send. Please try again.');
  });
});
