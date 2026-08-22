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
    // A spy rather than a stub: the question in front of Stop Sharing is only
    // worth anything if a "no" leaves this uncalled.
    stopSharing: vi.fn(() => Promise.resolve()),
  };
});

const { LiveShareView } = await import('./LiveShareView');
const live = await import('../../lib/liveSession');
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
  vi.mocked(live.stopSharing).mockClear();
  stores.scoringEnabled.set(false);
  stores.scoreEditingAllowed.set(false);
  stores.scoreEditCode.set(null);
  // Cleared rather than set back to true, so the test that says this switch
  // starts on is reading the store's own default. Setting it would make that
  // test pass against a default of false, which is exactly the mistake it is
  // there to catch. Safe because nothing is subscribed between tests: with no
  // listeners a store re-reads storage, and an absent key is the fallback.
  window.localStorage.removeItem(stores.standingsShared.key);
});

/**
 * The two switches, in the order the card offers them. Named rather than
 * indexed at each call site: they used to be one switch and a test that reached
 * for "the switch" would now get whichever happened to be drawn first.
 */
const switches = () => [...container.querySelectorAll('[role="switch"]')];
const standingsSwitch = () =>
  container.querySelector('[role="switch"][aria-label="Share Standings"]');
const switchEl = () =>
  container.querySelector('[role="switch"][aria-label="Allow Editing Scores"]');
const codeBoxes = () => [...container.querySelectorAll('input')];
/** The row of tiles, found by the one tile that is on every version of it. */
const tileRow = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === 'Stop Sharing')!
    .parentElement!;

function click(el: Element) {
  act(() => (el as HTMLElement).click());
}

const byLabel = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label);

/**
 * Stop Sharing, all the way through the question it now asks.
 *
 * The press alone stops nothing: it opens a dialog, because the row it is
 * deleting cannot be brought back and the key goes with it. Every test that
 * wanted the stopped card wants both halves.
 */
function stopSharing() {
  click(byLabel('Stop Sharing')!);
  click(byLabel('Yes, Stop')!);
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

  it('says what the link is worth, without telling them to scan their own code', () => {
    // The line about scanning went with the redesign. The host is holding the
    // code up; they know what a QR code is for, and the room under it is worth
    // more to the two switches that decide what the code opens on.
    const said = open(true);
    expect(said).not.toContain('Have people scan this QR code');
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
    const row = tileRow();
    expect(row.className).toContain('flex');

    const tiles = [...row.querySelectorAll('button')];
    expect(tiles.map((b) => b.textContent)).toEqual(['Copy Link', 'Stop Sharing']);
    for (const b of tiles) {
      // basis-0 is what makes them split the row evenly whether there are two
      // of them or three; flex-col is the glyph over the label.
      expect(b.className).toContain('basis-0');
      expect(b.className).toContain('flex-col');
    }
  });

  it('offers Share Link as a third tile where the phone has a share sheet', () => {
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      open(true);
      const tiles = [...tileRow().querySelectorAll('button')];
      expect(tiles.map((b) => b.textContent)).toEqual([
        'Share Link', 'Copy Link', 'Stop Sharing',
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
      'Tell this code to anyone you’d like to be a scorekeeper.'
    );
  });

  it('asks for the digits above the boxes and explains them below', () => {
    // The order Jeff set: the instruction where somebody reading down the panel
    // meets it before the boxes, and what the code is for underneath, which is
    // the part that matters once it has been typed.
    open(true);
    click(switchEl()!);

    const said = container.textContent ?? '';
    const asks = said.indexOf('Enter four digits');
    const tells = said.indexOf('Tell this code to anyone');
    expect(asks).toBeGreaterThan(-1);
    expect(tells).toBeGreaterThan(asks);

    // And the boxes really are between the two, rather than the two lines
    // happening to be in that order somewhere else on the card.
    const first = codeBoxes()[0];
    const positions = [...container.querySelectorAll('p, input')];
    const asksAt = positions.findIndex((el) => el.textContent === 'Enter four digits');
    expect(positions.indexOf(first)).toBeGreaterThan(asksAt);
    expect(positions.findIndex((el) => el.textContent?.startsWith('Tell this code')))
      .toBeGreaterThan(positions.indexOf(codeBoxes()[3]));
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

/**
 * Sharing the standings.
 *
 * The one switch on this card that is on before anybody touches it, because the
 * table is most of what people ask for once a round has been played. What is
 * guarded here is that default, that moving it is what the publisher reads, and
 * that it is not offered on a session with no table to share.
 */
describe('sharing the standings', () => {
  it('is off before the host has touched anything', () => {
    // Keeping score says how this host uses the app. It does not say they meant
    // to put a leaderboard on twenty strangers' phones, so the table is offered
    // rather than assumed.
    const said = open(true);
    expect(said).toContain('Share Standings');
    expect(said).toContain('(leaderboard)');
    expect(standingsSwitch()!.getAttribute('aria-checked')).toBe('false');
  });

  it('is the first of the two switches, above the tiles', () => {
    open(true);
    const all = switches();
    expect(all.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Share Standings',
      'Allow Editing Scores',
    ]);
    // Both decide what the link opens on, so both are read before the buttons
    // that hand the link out.
    expect(all[1].compareDocumentPosition(tileRow())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('writes the answer where the publisher reads it', () => {
    // The switch is the store. Nothing else would reach the document, and a
    // host who moved it would have moved nothing.
    open(true);
    click(standingsSwitch()!);
    expect(stores.standingsShared.get()).toBe(true);
    expect(standingsSwitch()!.getAttribute('aria-checked')).toBe('true');
  });

  it('stays where the host put it, for the next share and the next week', () => {
    // The other half of off-by-default: a host who says yes is not asked again.
    open(true);
    click(standingsSwitch()!);
    expect(stores.standingsShared.get()).toBe(true);

    open(true);
    expect(standingsSwitch()!.getAttribute('aria-checked')).toBe('true');
  });

  it('is not offered on a session with no standings to share', () => {
    // Scoring off means there is no table on anybody's page, whatever this
    // switch said, and offering it would promise a page that does not exist.
    open(false);
    expect(standingsSwitch()).toBeNull();
    expect(switches()).toHaveLength(0);
  });
});

/**
 * The panels that answer with one button.
 *
 * They kept an ordinary full-width button while every other panel in the sheet
 * had moved to tiles, and the one after Stop Sharing was still in the old solid
 * green. A lone tile is capped and centred rather than stretched, which is the
 * whole reason those panels had been left alone.
 */
describe('the one-button panels', () => {
  it('offers a centred teal tile to start again, not a solid green button', () => {
    open(true);
    stopSharing();

    const button = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Share This Session'
    )!;
    expect(button).toBeDefined();
    // Teal, and pale: the solid fill it used to wear is the one thing on a card
    // of tiles that reads as the only real button.
    expect(button.className).toContain('bg-brand-teal-light');
    expect(button.className).not.toContain('bg-[#018D31]');
    // The tile's own shape — glyph over label — and a row that is capped and
    // centred rather than the width of the sheet.
    expect(button.className).toContain('flex-col');
    expect(button.parentElement!.className).toContain('mx-auto');
    expect(button.parentElement!.className).toContain('max-w-[11rem]');
  });
});

/**
 * The question in front of Stop Sharing.
 *
 * It is the one irreversible press on the card: the row is deleted, the key is
 * thrown away, and Share This Session mints a new one that everybody has to
 * scan again. A thumb landing on it by accident used to cost the host exactly
 * that, with nothing in between.
 */
describe('stopping', () => {
  it('asks before it stops, and a no leaves the link alone', () => {
    open(true);
    click(byLabel('Stop Sharing')!);

    expect(container.textContent).toContain('Stop Sharing?');
    // The promise the dialog is there to make: it is a new link afterwards.
    expect(container.textContent).toContain('link for them all to scan');

    click(byLabel('Keep Sharing')!);
    // Back on the card, with the code still on it and nothing taken down.
    expect(byLabel('Share This Session')).toBeUndefined();
    expect(byLabel('Stop Sharing')).toBeDefined();
    expect(live.stopSharing).not.toHaveBeenCalled();
  });

  it('stops on a yes', () => {
    open(true);
    stopSharing();

    expect(byLabel('Share This Session')).toBeDefined();
    expect(live.stopSharing).toHaveBeenCalledTimes(1);
  });

  it('says the link is gone, and does not promise the old one back', () => {
    open(true);
    stopSharing();

    expect(container.textContent).toContain(
      'Sharing has stopped and the old link no longer works.'
    );
    // The sentence that used to follow it was not true: the key is gone, a new
    // one is minted, and every phone that scanned the old code has to scan
    // again. Jeff's call on 2026-08-21.
    expect(container.textContent).not.toContain('puts this session back');
  });
});

/**
 * The LIVE pill, on the host's own card.
 *
 * The same shape the watchers see in the corner of their page. Here it says
 * that the code directly under it is working, which is the one thing a host
 * holding a phone up in front of fourteen people wants to know.
 */
describe('the LIVE pill', () => {
  it('stands above the code while the session is being shared', () => {
    open(true);
    expect(container.textContent).toContain('LIVE');
    // A statement, not a way anywhere: this is already the panel it opens.
    expect(byLabel('LIVE')).toBeUndefined();
  });

  it('goes with the code when sharing stops', () => {
    open(true);
    stopSharing();
    expect(container.textContent).not.toContain('LIVE');
  });
});
