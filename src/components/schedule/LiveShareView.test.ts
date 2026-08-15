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
  stores.scoreEditingAllowed.set(false);
  stores.scoreEditCode.set(null);
});

const switchEl = () => container.querySelector('[role="switch"]');
const codeBoxes = () => [...container.querySelectorAll('input')];

function click(el: Element) {
  act(() => (el as HTMLElement).click());
}

describe('the card the host holds up', () => {
  it('names the scores when the session is keeping them', () => {
    const said = open(true);
    expect(said).toContain('Names, courts and scores are shared. Player ratings are not.');
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

  it('tells them what to do with the code, and what the link is worth', () => {
    const said = open(true);
    expect(said).toContain('Have people scan this QR code, or send the link.');
    expect(said).toContain(
      'Changes you make appear on their phones. The link stops working after 24 hours.'
    );
  });

  it('puts what you can do with a link on one row, not stacked down the page', () => {
    // Stacked full width they read as steps to work through in order, which is
    // wrong: they are one decision made once.
    //
    // Two tiles here rather than three. There is no navigator.share in this
    // environment, which is the same answer a desktop browser gives, and the
    // row is built to divide by however many it has.
    open(true);
    const row = container.querySelector('button')!.parentElement!;
    expect(row.className).toContain('flex');

    const tiles = [...row.querySelectorAll('button')];
    expect(tiles.map((b) => b.textContent)).toEqual(['Copy link', 'Stop Sharing']);
    for (const b of tiles) {
      // basis-0 is what makes them split the row evenly whether there are two
      // of them or three; flex-col is the glyph over the label.
      expect(b.className).toContain('basis-0');
      expect(b.className).toContain('flex-col');
    }
  });

  it('offers Share link as a third tile where the phone has a share sheet', () => {
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      open(true);
      const row = container.querySelector('button')!.parentElement!;
      const tiles = [...row.querySelectorAll('button')];
      expect(tiles.map((b) => b.textContent)).toEqual([
        'Share link', 'Copy link', 'Stop Sharing',
      ]);
    } finally {
      Reflect.deleteProperty(navigator, 'share');
    }
  });
});

/**
 * Letting the watchers change the scores.
 *
 * The switch is the host's decision about one afternoon, and the code is the
 * thing they say out loud to the people on the court. What is guarded here is
 * that the switch cannot be offered where it would be a lie, and that turning
 * it off does not leave a code behind to come back with it.
 */
describe('allowing the watchers to edit scores', () => {
  it('offers the switch on a session that keeps score', () => {
    const said = open(true);
    expect(said).toContain('Allow Editing Scores');
    expect(switchEl()).not.toBeNull();
    expect(switchEl()!.getAttribute('aria-checked')).toBe('false');
  });

  it('does not offer it at all when scoring is off', () => {
    // There are no scores on the watchers' phones to edit, so a switch here
    // would promise something the shared page cannot do. The card's existing
    // test that no word of "score" appears is the other half of this.
    open(false);
    expect(switchEl()).toBeNull();
    expect(codeBoxes()).toHaveLength(0);
  });

  it('keeps the code boxes out of reach until it is switched on', () => {
    // A zero height grid row still has focusable children in it, so the row
    // is made invisible as well as flat. Without that the four boxes are in
    // the tab order of a card that is not showing them.
    open(true);
    const reveal = container.querySelector('.grid')!;
    expect(reveal.className).toContain('grid-rows-[0fr]');
    expect(reveal.className).toContain('invisible');
  });

  it('slides the code boxes out when it is switched on', () => {
    open(true);
    click(switchEl()!);

    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
    const reveal = container.querySelector('.grid')!;
    expect(reveal.className).toContain('grid-rows-[1fr]');
    expect(reveal.className).not.toContain('invisible');
    expect(codeBoxes()).toHaveLength(4);
    expect(container.textContent).toContain(
      'Set a code, then tell it to whoever you want changing scores.'
    );
  });

  it('says what is still missing, then what the code is worth', () => {
    open(true);
    click(switchEl()!);
    expect(container.textContent).toContain('Enter four digits.');

    stores.scoreEditCode.set('4719');
    act(() => {
      root.render(createElement(LiveShareView, {}));
    });
    expect(container.textContent).toContain('Anyone with this code can change any score.');
    expect(container.textContent).not.toContain('Enter four digits.');
  });

  it('throws the code away when it is switched off again', () => {
    // Turning it back on is a new decision. A code that survived would be one
    // the host told a different set of people on a different afternoon.
    open(true);
    click(switchEl()!);
    stores.scoreEditCode.set('4719');
    click(switchEl()!);

    expect(stores.scoreEditCode.get()).toBeNull();
    expect(stores.scoreEditingAllowed.get()).toBe(false);
  });

  it('remembers the switch across a reload', () => {
    // It lives in a store rather than in this component's state, so a host who
    // backs out of the sheet and opens it again finds what they set.
    stores.scoreEditingAllowed.set(true);
    stores.scoreEditCode.set('4719');
    open(true);
    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
    expect(codeBoxes().map((b) => (b as HTMLInputElement).value)).toEqual(['4', '7', '1', '9']);
  });
});
