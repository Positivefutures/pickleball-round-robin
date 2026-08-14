/**
 * @vitest-environment happy-dom
 *
 * The first-run tour, driven end to end on the real App.
 *
 * happy-dom has no layout, so every rect is zero and nothing here can say a
 * word about where the tour draws — that is all in tourGeometry.test.ts, which
 * checks it as arithmetic, and tour.test.ts, which checks the deck as data. What
 * this file is for is the part only a running app can answer: that pressing the
 * real controls moves the tour, that pressing them when they do not work does
 * not, and above all who never sees any of it. A tour that appears in front of a
 * host mid-season with real groups is the worst thing this feature could do, and
 * the guard against it is one `&&` — so it gets a test of its own.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';
import {
  OPENER_DELAY_MS, TOUR_COURTS_START, TOUR_COURTS_TARGET, TOUR_ROUNDS_START,
  TOUR_ROUNDS_TARGET, TOUR_STEPS, __tourTesting,
} from './lib/tour';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A device nobody has ever opened the app on. */
function freshInstall() {
  window.localStorage.clear();
  runMigrations();
}

/** Somebody who typed their own group in, so nothing was ever seeded for them. */
function existingInstall() {
  window.localStorage.clear();
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Tuesday Crew' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem(
    'pb-roster',
    JSON.stringify(
      ['Ava', 'Ben', 'Cara', 'Dan', 'Eve'].map((name, i) => ({
        id: `p${i}`,
        name,
        rating: 3.5,
        gender: i % 2 === 0 ? 'M' : 'F',
        rosterIds: ['g1'],
      }))
    )
  );
  runMigrations();
}

let root: Root;
let container: HTMLElement;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(App));
  });
}

/** A relaunch: all the way down and up again. */
function remount(between?: () => void) {
  act(() => root.unmount());
  container.remove();
  between?.();
  mount();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  __tourTesting.reset();
  vi.useRealTimers();
});

const text = (el: Element) => (el.textContent ?? '').trim();
const body = () => text(document.body);

function overlay(): HTMLElement | null {
  return document.querySelector('[data-tutorial-overlay]');
}

const openerShowing = () => body().includes('Quick Start Tutorial');
const completeShowing = () => body().includes('Tutorial Complete!');

/**
 * Let the overlay's measure loop run once.
 *
 * It watches the DOM on requestAnimationFrame rather than from listeners,
 * because the things it has to notice — a panel opening from a child's own
 * state, a font swapping in, an image landing — report to nobody.
 */
function frame() {
  act(() => {
    vi.advanceTimersByTime(40);
  });
}

/** Let the greeting's beat pass. */
function waitForOpener() {
  act(() => {
    vi.advanceTimersByTime(OPENER_DELAY_MS);
  });
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function button(re: RegExp, scope: ParentNode = document.body): HTMLElement {
  const found = [...scope.querySelectorAll('button, [role="button"]')].find((b) =>
    re.test(text(b))
  );
  if (!found) {
    throw new Error(
      `no button matching ${re}; saw: ${[...scope.querySelectorAll('button')]
        .map((b) => JSON.stringify(text(b).slice(0, 24)))
        .join(', ')}`
    );
  }
  return found as HTMLElement;
}

const clickButton = (re: RegExp, scope: ParentNode = document.body) => click(button(re, scope));

function has(re: RegExp, scope: ParentNode = document.body): boolean {
  return [...scope.querySelectorAll('button, [role="button"]')].some((b) => re.test(text(b)));
}

const stored = (key: string) => window.localStorage.getItem(key);
const read = (key: string, fallback: string) => JSON.parse(stored(key) ?? fallback);
const stage = () => read('pb-tour-stage', 'null');
const courts = () => read('pb-num-courts', 'null');
const rounds = () => read('pb-num-rounds', 'null');
const ticked = () => read('pb-selected-ids', '[]') as string[];
/** Unwritten until something moves it, and the store's own default is roster. */
const step = () => read('pb-step', '"roster"');

/** Which card is up, by the counter it prints in its own bubble. */
function cardNumber(): number | null {
  const m = body().match(/Step (\d+) of (\d+)/);
  return m ? Number(m[1]) : null;
}

/** Off the greeting and onto the first card. */
function begin() {
  freshInstall();
  mount();
  waitForOpener();
  clickButton(/^Continue$/);
}

/** Card 1 through to a schedule the host generated, standing on card 4. */
function throughSetup() {
  begin();
  clickButton(/^Continue to Setup/);
  clickButton(/^Next$/);
  clickButton(/^Select All$/);
  clickButton(/^Generate Schedule/);
}

describe('who gets greeted', () => {
  it('says nothing for the first second, then offers the tour', () => {
    // The whole reason it is a sheet and not a splash screen: the Players tab
    // is on screen and readable before anything is asked of them.
    freshInstall();
    mount();

    expect(openerShowing()).toBe(false);
    expect(body()).toContain('Sample Group');

    waitForOpener();
    expect(openerShowing()).toBe(true);
    expect(body()).toContain('Let’s create your first round robin!');
  });

  it('never greets a device that was not seeded with a Sample Group', () => {
    // The beta tester's phone, and every existing user's. exampleMeta is
    // written by the fresh-install branch of runMigrations and nowhere else, so
    // a group somebody typed in themselves can never trip this.
    existingInstall();
    expect(stored('pb-example-meta')).toBeNull();

    mount();
    waitForOpener();

    expect(openerShowing()).toBe(false);
    expect(overlay()).toBeNull();
  });

  it('never greets the same device twice', () => {
    begin();
    clickButton(/^Skip$/);
    remount();
    waitForOpener();
    expect(openerShowing()).toBe(false);
  });

  it('has no Skip on the greeting itself', () => {
    // One button, because the tour behind it carries a Skip on every card.
    freshInstall();
    mount();
    waitForOpener();
    expect(has(/^Skip$/)).toBe(false);
  });
});

describe('what Continue sets up', () => {
  it('starts both steppers below the numbers the tour asks for', () => {
    begin();
    expect(courts()).toBe(TOUR_COURTS_START);
    expect(rounds()).toBe(TOUR_ROUNDS_START);
    expect(TOUR_COURTS_START).toBeLessThan(TOUR_COURTS_TARGET);
    expect(TOUR_ROUNDS_START).toBeLessThan(TOUR_ROUNDS_TARGET);
  });

  it('leaves four of the fourteen unticked, so Select All has a job', () => {
    begin();
    expect(ticked()).toHaveLength(10);
  });

  it('lands on the first card with the tour running', () => {
    begin();
    expect(stage()).toBe('running');
    expect(cardNumber()).toBe(1);
    expect(body()).toContain('I’ve created a sample group for you with 14 players');
  });
});

describe('the cards that hand over a real control', () => {
  it('gives the Players card no Next, and moves it on Continue to Setup', () => {
    begin();
    expect(has(/^Next$/)).toBe(false);
    expect(has(/^Back$/)).toBe(false);
    expect(has(/^Skip$/)).toBe(true);

    clickButton(/^Continue to Setup/);
    expect(cardNumber()).toBe(2);
    expect(step()).toBe('setup');
  });

  it('gives the Select Players card no Next, and moves it on Generate', () => {
    begin();
    clickButton(/^Continue to Setup/);
    clickButton(/^Next$/);
    expect(cardNumber()).toBe(3);
    expect(has(/^Next$/)).toBe(false);

    clickButton(/^Select All$/);
    clickButton(/^Generate Schedule/);
    expect(cardNumber()).toBe(4);
    expect(step()).toBe('schedule');
  });

  it('stays put when Generate could not build anything', () => {
    // Deselect All is live on this card too, and pressing it leaves nobody to
    // schedule. The button shows its error and builds nothing, and the tour
    // must not walk on to a Schedule tab with no schedule under it.
    begin();
    clickButton(/^Continue to Setup/);
    clickButton(/^Next$/);
    clickButton(/^Deselect All$/);
    clickButton(/^Generate Schedule/);

    expect(cardNumber()).toBe(3);
    expect(step()).toBe('setup');
    expect(body()).toContain('Need at least');
  });

  it('builds a schedule even for a host who ignored Select All', () => {
    // Ten of fourteen still fills three courts — the last one plays a 2v1
    // rather than sending anybody home. The card asks for Select All because
    // the full group is the better first schedule, not because ten would break.
    begin();
    clickButton(/^Continue to Setup/);
    clickButton(/^Next$/);
    clickButton(/^Generate Schedule/);

    expect(cardNumber()).toBe(4);
    expect(step()).toBe('schedule');
  });

  it('gives the Actions card no Next, and moves it when the sheet opens', () => {
    throughSetup();
    clickButton(/^Next$/); // 4 -> 5
    clickButton(/^Next$/); // 5 -> 6
    clickButton(/^Next$/); // 6 -> 7
    expect(cardNumber()).toBe(7);
    expect(has(/^Next$/)).toBe(false);

    clickButton(/^Actions$/);
    expect(cardNumber()).toBe(8);
    expect(body()).toContain('Quick changes for this session');
  });
});

describe('the courts card keeps its own promise', () => {
  it('sets both numbers whatever the host did with the steppers', () => {
    // The card says "set the Number of Courts to 3 and Rounds to 10". Next
    // makes that sentence true either way, so the schedule a card later is the
    // one being described. Both numbers, not just the one that changes the
    // shape of the page.
    begin();
    clickButton(/^Continue to Setup/);
    expect(courts()).toBe(TOUR_COURTS_START);
    expect(rounds()).toBe(TOUR_ROUNDS_START);

    clickButton(/^Next$/);
    expect(courts()).toBe(TOUR_COURTS_TARGET);
    expect(rounds()).toBe(TOUR_ROUNDS_TARGET);
  });
});

describe('the last card', () => {
  function toLastCard() {
    throughSetup();
    clickButton(/^Next$/);
    clickButton(/^Next$/);
    clickButton(/^Next$/);
    clickButton(/^Actions$/);
  }

  it('asks no question before starting the new round robin', () => {
    toLastCard();
    clickButton(/^New Round Robin$/);

    // Straight there. No "New round robin?" panel in between, because the card
    // has just told them to press it.
    expect(body()).not.toContain('New round robin?');
    expect(step()).toBe('roster');
  });

  it('closes with a panel and not with nothing', () => {
    toLastCard();
    clickButton(/^New Round Robin$/);

    expect(completeShowing()).toBe(true);
    expect(body()).toContain('thanks for being an organizer');
    expect(overlay()).toBeNull();
    expect(stage()).toBe('done');
  });

  it('leaves the app alone once Done is pressed', () => {
    toLastCard();
    clickButton(/^New Round Robin$/);
    clickButton(/^Done$/);

    expect(completeShowing()).toBe(false);
    expect(overlay()).toBeNull();
    expect(body()).toContain('Sample Group');

    remount();
    waitForOpener();
    expect(openerShowing()).toBe(false);
    expect(overlay()).toBeNull();
  });
});

describe('Back and Skip', () => {
  it('walks back from the third card to the first', () => {
    begin();
    clickButton(/^Continue to Setup/);
    clickButton(/^Next$/);
    expect(cardNumber()).toBe(3);

    clickButton(/^Back$/);
    expect(cardNumber()).toBe(2);
    clickButton(/^Back$/);
    expect(cardNumber()).toBe(1);
    expect(step()).toBe('roster');
    expect(has(/^Back$/)).toBe(false);
  });

  it('offers no way back to before the schedule existed', () => {
    throughSetup();
    expect(cardNumber()).toBe(4);
    expect(has(/^Back$/)).toBe(false);
  });

  it('places the page again on a card it is walking back into', () => {
    // The bug this replaces: the overlay remembered which cards it had already
    // scrolled for and skipped the ones it had seen. Forwards that is harmless.
    // Backwards it is not — the card being returned to was left behind by the
    // card after it scrolling somewhere else, so Back showed a bubble with none
    // of its controls anywhere near the screen.
    //
    // happy-dom reports every rect as zero, so the smallest-scroll cards ask for
    // nothing measurable. The congratulations card is the one that goes to a
    // fixed place, which makes its arrival observable — and it has to be matched
    // on the exact call, because releasing the scroll lock calls scrollTo too.
    throughSetup();
    frame();
    expect(cardNumber()).toBe(4);
    clickButton(/^Next$/);
    frame();
    expect(cardNumber()).toBe(5);

    const scrollTo = vi.spyOn(window, 'scrollTo');
    clickButton(/^Back$/);
    frame();

    expect(cardNumber()).toBe(4);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    scrollTo.mockRestore();
  });

  it('ends the tour from any card, for good', () => {
    begin();
    clickButton(/^Continue to Setup/);
    clickButton(/^Skip$/);

    expect(overlay()).toBeNull();
    expect(stage()).toBe('done');
    remount();
    waitForOpener();
    expect(overlay()).toBeNull();
  });
});

describe('a relaunch part way through', () => {
  it('comes back on the card whose anchors are on the tab it reopened', () => {
    begin();
    clickButton(/^Continue to Setup/);
    expect(cardNumber()).toBe(2);

    remount();
    expect(stage()).toBe('running');
    expect(cardNumber()).toBe(2);
  });
});

/**
 * Three things happy-dom can only see as class names, guarded here anyway.
 *
 * They are all CSS-only properties with no layout to measure, and every one of
 * them has already been the bug: the overlay's own root swallowing the click it
 * was waiting for, the buttons landing in a bubble that is not the one being
 * acted on, and the last card drawing underneath the sheet it is pointing into.
 * A class-name assertion is a poor test. It is a much better test than nothing.
 */
describe('what the overlay draws', () => {
  it('lets clicks through its own root', () => {
    // Children paint above their parent, so the shields work either way. But
    // over a hole the card has left live there is no child, and a root taking
    // its own pointer events is the hit target there — which is exactly why
    // Continue to Setup did nothing for a whole round of testing.
    begin();
    expect(overlay()!.className).toContain('pointer-events-none');
  });

  it('puts the step counter in the bubble being acted on', () => {
    // Card 1 is the only one with two bubbles. The counter cannot live in both,
    // and the one that matters is the one beside the button they are being
    // asked to press.
    begin();
    const bubbles = [...overlay()!.querySelectorAll('div')].filter((d) =>
      /Click Continue to Setup|created a sample group/.test(text(d))
    );
    const withControls = bubbles.filter((d) => /Step 1 of 8/.test(text(d)));

    expect(withControls).not.toHaveLength(0);
    for (const b of withControls) expect(text(b)).toContain('Click Continue to Setup');
    expect(body()).toContain('Step 1 of 8');
  });

  it('keeps Skip out of the bubbles and at the foot of the screen', () => {
    // In the corner of a bubble it read as one of that card's two buttons. It
    // is not: it is the way out of the whole tour, so it sits somewhere fixed
    // that no card owns, and every card has to be able to find it.
    begin();
    const skip = overlay()!.querySelector('[data-tour-skip]');
    expect(skip).not.toBeNull();
    expect(text(skip!)).toBe('Skip');

    const bubbles = [...overlay()!.querySelectorAll('div')].filter((d) =>
      /Click Continue to Setup/.test(text(d))
    );
    for (const b of bubbles) expect(b.contains(skip)).toBe(false);

    click(skip!);
    expect(overlay()).toBeNull();
    expect(stage()).toBe('done');
  });

  it('rings what the card is about, and never the tab', () => {
    // Card 1 boxes two things: the group name and Continue to Setup. The live
    // step tab is a third hole in the darkness and must stay a plain one — a
    // ring there is the tour pointing at where the host already is.
    begin();
    expect(overlay()!.querySelectorAll('[data-tour-ring]')).toHaveLength(2);

    clickButton(/^Continue to Setup/);
    expect(overlay()!.querySelectorAll('[data-tour-ring]')).toHaveLength(1);
  });

  it('stands down while one of the app’s own panels is open, and comes back', () => {
    // It cannot get out of the way with a z-index: `.app-panel` carries z-10,
    // so every panel inside it stacks within that one context and the overlay
    // outside comes out over the lot however low it sets itself. So it draws
    // nothing at all instead, and takes none of the clicks.
    begin();
    expect(overlay()).not.toBeNull();

    click(document.querySelector('[data-tutorial="group-name"]')!);
    expect(document.querySelector('[data-tour-suspends]')).not.toBeNull();
    frame();
    expect(overlay()).toBeNull();

    clickButton(/^Close$/);
    expect(document.querySelector('[data-tour-suspends]')).toBeNull();
    frame();
    expect(overlay()).not.toBeNull();
    expect(cardNumber()).toBe(1);
  });
});

describe('what the tour suppresses while it is up', () => {
  it('hides the pencil on a seat the host taps mid-tour', () => {
    // The swap card leaves the seats live, so a tap really selects. A second
    // control inside the seat they just tapped competes with the one thing the
    // card is asking them to do, which is tap one more player.
    throughSetup();
    clickButton(/^Next$/);
    clickButton(/^Next$/);
    const seat = [...document.querySelectorAll('.round-card button')].find((b) =>
      /^[A-Z][a-z]+ [A-Z]\./.test(text(b))
    );
    expect(seat).toBeDefined();
    click(seat!);

    // The tap landed — the seat really is selected, so the pencil had its
    // chance to appear and was told not to. It carries its name on aria-label
    // rather than in text, so `has` would never have seen it either way.
    expect(document.querySelectorAll('[aria-selected="true"], .ring-blue-500').length
      + [...document.querySelectorAll('.round-card button')].filter((b) =>
        b.className.includes('ring-2')).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[aria-label^="Edit "]')).toHaveLength(0);
  });

  it('keeps the swap hint off the schedule', () => {
    // Card 6 teaches this at more length than the hint ever did, and a second
    // box on the same screen saying the same thing is noise.
    throughSetup();
    expect(body()).not.toContain('Tap a player');
  });

  it('every card names a tab the app can actually be on', () => {
    const tabs = new Set(TOUR_STEPS.map((s) => s.tab));
    expect([...tabs].sort()).toEqual(['roster', 'schedule', 'setup']);
  });
});
