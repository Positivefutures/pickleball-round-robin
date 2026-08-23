import { describe, it, expect, vi, afterEach } from 'vitest';
import { canShare, sessionPayload, shareApp, sharePayload, SHARE_TITLE } from './share';
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

/**
 * What lands in somebody's mail app. The title is the subject and the text is
 * the body, so both are read by a person who was not in the conversation.
 */
describe('sessionPayload', () => {
  const url = 'https://app.roundrobinator.com/?s=ABCDEFGHJK';

  it('names the scores when the session is keeping them', () => {
    expect(sessionPayload(url, true)).toEqual({
      title: 'Our Round Robin Schedule and Scores',
      text: 'Tap the link to view our round robin schedule and scores.',
      url,
    });
  });

  // A link that promises scores and shows none reads as a broken link.
  it('promises only the schedule when scoring is off', () => {
    const payload = sessionPayload(url, false);
    expect(payload).toEqual({
      title: 'Our Round Robin Schedule',
      text: 'Tap the link to view our round robin schedule.',
      url,
    });
    expect(payload.title).not.toContain('Score');
    expect(payload.text).not.toContain('score');
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

// The Share panel leaves its "Share…" button out entirely when this is false,
// so a wrong answer either hides a working button or offers a dead one.
describe('canShare', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  });

  function withNavigator(value: unknown) {
    Object.defineProperty(globalThis, 'navigator', {
      value,
      configurable: true,
      writable: true,
    });
  }

  it('is true when the browser has a share sheet', () => {
    withNavigator({ share: () => Promise.resolve() });
    expect(canShare()).toBe(true);
  });

  it('is false when navigator has no share method', () => {
    withNavigator({});
    expect(canShare()).toBe(false);
  });

  // Server-side rendering and the vitest node environment both hit this path.
  it('is false when there is no navigator at all', () => {
    withNavigator(undefined);
    expect(canShare()).toBe(false);
  });
});
