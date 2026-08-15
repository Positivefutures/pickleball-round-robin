/**
 * @vitest-environment happy-dom
 *
 * What the Share Live Session card promises.
 *
 * Every sentence on it is read by a host about to hold a QR code up to a court
 * full of people, and each one is a promise about what those people will see.
 * A session with scoring off shares a schedule and nothing else, so the card
 * must not offer scores it will never publish — the same rule the shared
 * message follows in share.test.ts.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const url = 'https://app.pbroundrobin.com/?s=ABCDEFGHJK';

vi.mock('../../lib/liveSession', () => {
  // One object, handed back every time. useSyncExternalStore compares
  // snapshots by identity, so a fresh one per call is an infinite render.
  const status = { state: 'live', url: 'https://app.pbroundrobin.com/?s=ABCDEFGHJK' };
  return {
    liveStatusStore: {
      get: () => status,
      subscribe: () => () => {},
    },
    sharingAvailable: () => true,
    startSharing: () => Promise.resolve(),
    stopSharing: () => Promise.resolve(),
  };
});

const { LiveShareView } = await import('./LiveShareView');
const stores = await import('../../lib/stores');

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

function open(scoring: boolean): string {
  stores.scoringEnabled.set(scoring);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(LiveShareView, {}));
  });
  return container.textContent ?? '';
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  stores.scoringEnabled.set(false);
});

describe('the card the host holds up', () => {
  it('names the scores when the session is keeping them', () => {
    const said = open(true);
    expect(said).toContain('Names, courts and scores are shared. Player ratings are not.');
    expect(said).toContain('Scores appear on their phones as you write them down.');
    expect(said).toContain('The link stops working after 24 hours.');
  });

  it('promises no scores when scoring is off', () => {
    const said = open(false);
    expect(said).toContain('Names and courts are shared. Player ratings are not.');
    expect(said).not.toContain('score');
    expect(said).not.toContain('Score');
    // The rest of the card is unchanged, so this is not passing on an empty
    // card that says nothing at all.
    expect(said).toContain('The link stops working after 24 hours.');
    expect(said).toContain(url);
  });
});
