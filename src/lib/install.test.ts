import { describe, it, expect } from 'vitest';
import { isIos, installRoute } from './install';

// Real user-agent strings — the iPad/Mac pair is the whole reason this needs care.
const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  mac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('isIos', () => {
  it('recognises an iPhone', () => {
    expect(isIos(UA.iphone, 5)).toBe(true);
  });

  // iPadOS 13+ claims to be a Mac; touch points are what separate them
  it('recognises an iPad despite its Macintosh user agent', () => {
    expect(isIos(UA.ipad, 5)).toBe(true);
  });

  it('does not mistake a Mac for an iPad', () => {
    expect(isIos(UA.mac, 0)).toBe(false);
  });

  it('is false for Android and desktop Chrome', () => {
    expect(isIos(UA.androidChrome, 5)).toBe(false);
    expect(isIos(UA.desktopChrome, 0)).toBe(false);
  });

  it('is false rather than throwing on an empty user agent', () => {
    expect(isIos('', 0)).toBe(false);
  });
});

describe('installRoute', () => {
  it('prefers the native prompt whenever one is held', () => {
    expect(installRoute({ canPrompt: true, ua: UA.androidChrome, maxTouchPoints: 5 }))
      .toBe('native');
    // Even on iOS: if a prompt somehow exists, using it beats printed steps
    expect(installRoute({ canPrompt: true, ua: UA.iphone, maxTouchPoints: 5 })).toBe('native');
  });

  it('sends iOS to the illustrated steps when there is no prompt', () => {
    expect(installRoute({ canPrompt: false, ua: UA.iphone, maxTouchPoints: 5 })).toBe('ios');
    expect(installRoute({ canPrompt: false, ua: UA.ipad, maxTouchPoints: 5 })).toBe('ios');
  });

  it('falls back to browser-menu instructions elsewhere', () => {
    expect(installRoute({ canPrompt: false, ua: UA.desktopChrome, maxTouchPoints: 0 }))
      .toBe('manual');
    expect(installRoute({ canPrompt: false, ua: UA.mac, maxTouchPoints: 0 })).toBe('manual');
  });

  // A blank panel would be the worst outcome, so every input must pick a route
  it('always returns one of the three routes', () => {
    for (const ua of Object.values(UA)) {
      for (const touch of [0, 5]) {
        for (const canPrompt of [true, false]) {
          expect(['native', 'ios', 'manual']).toContain(
            installRoute({ canPrompt, ua, maxTouchPoints: touch })
          );
        }
      }
    }
  });
});
