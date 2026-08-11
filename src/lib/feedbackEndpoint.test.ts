/**
 * The one piece of server this app has.
 *
 * It lives in api/, outside src/, because that is where Vercel looks for a
 * function. The test lives here because that is where vitest looks. Both are
 * happy, and the handler is an ordinary function either way: a Request in, a
 * Response out, and one fetch to Resend in between, which is what is stubbed.
 *
 * What matters most is what it refuses. It is a public address that sends mail
 * on somebody else's key, so the checks are the feature.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler from '../../api/feedback';
import { FEEDBACK_EMAIL } from './appInfo';

const REPORT = {
  kind: 'bug',
  summary: 'Wrong sit-outs',
  details: 'Round 3 sat the same two out twice.',
  replyTo: '',
  context: { version: '2.00', step: '3. Schedule' },
};

/** A POST as the browser would make it, from a fresh address each time. */
function post(body: unknown, ip = `10.0.0.${Math.floor(Math.random() * 250)}`) {
  return new Request('https://app.pbroundrobin.com/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** What Resend was asked to send, from the last call. */
function lastMail(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  return JSON.parse(init.body as string);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'sent' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sending a report', () => {
  it('hands it to Resend and says it went', async () => {
    const response = await handler(post(REPORT));
    expect(response.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('sends it to the address the app already shows people', async () => {
    // One constant, so the address in the menu and the address it arrives at
    // cannot drift apart.
    await handler(post(REPORT));
    expect(lastMail(fetchMock).to).toEqual([FEEDBACK_EMAIL]);
  });

  it('writes the subject and the diagnostics into the mail', async () => {
    await handler(post(REPORT));
    const mail = lastMail(fetchMock);
    expect(mail.subject).toBe('[Bug] Wrong sit-outs');
    expect(mail.text).toContain('Round 3 sat the same two out twice.');
    expect(mail.text).toContain('Version: 2.00');
  });

  it('sets reply-to when an address was given', async () => {
    await handler(post({ ...REPORT, replyTo: 'someone@example.com' }));
    expect(lastMail(fetchMock).reply_to).toEqual(['someone@example.com']);
  });

  it('leaves reply-to off when it was not', async () => {
    await handler(post(REPORT));
    expect('reply_to' in lastMail(fetchMock)).toBe(false);
  });
});

describe('what it refuses', () => {
  it('answers 503 and sends nothing when the key is not set', async () => {
    // The deployed state before the key is added. It has to be a message, not
    // a crash: this is what everyone sees until the variable exists.
    vi.stubEnv('RESEND_API_KEY', '');
    const response = await handler(post(REPORT));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await response.json()).error).toContain('not set up');
  });

  it('will not be read from with a GET', async () => {
    const response = await handler(
      new Request('https://app.pbroundrobin.com/api/feedback', { method: 'GET' })
    );
    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns away an empty report rather than mailing me nothing', async () => {
    const response = await handler(post({ ...REPORT, summary: '  ' }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns away a body that is not even JSON', async () => {
    const response = await handler(post('not json at all'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cuts an enormous message down rather than forwarding it whole', async () => {
    await handler(post({ ...REPORT, details: 'y'.repeat(200_000) }));
    expect(lastMail(fetchMock).text.length).toBeLessThan(5000);
  });

  it('stops one address after a handful in a row', async () => {
    // Sign-in codes come out of the same Resend allowance, so a flood here is
    // a flood that stops people signing in.
    const ip = '203.0.113.9';
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await handler(post(REPORT, ip))).status);

    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429, 429]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('lets everybody else through while it is doing that', async () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < 7; i++) await handler(post(REPORT, ip));
    expect((await handler(post(REPORT, '203.0.113.11'))).status).toBe(200);
  });
});

describe('when Resend itself fails', () => {
  it('says so rather than claiming it sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('domain not verified', { status: 403 }))
    );
    const response = await handler(post(REPORT));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('did not send');
  });

  it('survives the request never landing at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const response = await handler(post(REPORT));
    expect(response.status).toBe(502);
  });
});
