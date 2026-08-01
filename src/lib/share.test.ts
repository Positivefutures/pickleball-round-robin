import { describe, it, expect, vi } from 'vitest';
import { shareApp, sharePayload, SHARE_TITLE } from './share';
import { APP_URL } from './appInfo';

function abortError() {
  const err = new Error('user cancelled');
  err.name = 'AbortError';
  return err;
}

describe('sharePayload', () => {
  it('carries the title and the app address', () => {
    expect(sharePayload()).toEqual({ title: SHARE_TITLE, url: APP_URL });
  });

  // Share targets append `text` to the url, so any message body here ends up in
  // the sent message. The share must be the bare link.
  it('sends no message body alongside the link', () => {
    expect(sharePayload()).not.toHaveProperty('text');
    expect(Object.keys(sharePayload()).sort()).toEqual(['title', 'url']);
  });

  it('shares a real https address', () => {
    expect(sharePayload().url).toMatch(/^https:\/\//);
  });
});

describe('shareApp', () => {
  it('reports shared when the sheet completes', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareApp(share)).toBe('shared');
    expect(share).toHaveBeenCalledWith(sharePayload());
  });

  it('reports unsupported when the browser has no share sheet', async () => {
    expect(await shareApp(undefined)).toBe('unsupported');
  });

  // Cancelling must not be mistaken for a failure, or the caller pops a panel
  // at someone who deliberately backed out.
  it('reports dismissed when the user cancels', async () => {
    const share = vi.fn().mockRejectedValue(abortError());
    expect(await shareApp(share)).toBe('dismissed');
  });

  it('reports failed on any other error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    expect(await shareApp(share)).toBe('failed');
  });

  it('calls share before awaiting, so the iOS user gesture survives', async () => {
    let calledSynchronously = false;
    const share = vi.fn(() => {
      calledSynchronously = true;
      return Promise.resolve();
    });
    const pending = shareApp(share); // not awaited yet
    expect(calledSynchronously).toBe(true);
    await pending;
  });
});
