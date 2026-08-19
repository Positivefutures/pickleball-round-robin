/**
 * @vitest-environment happy-dom
 *
 * Driver for the manual walkthrough — mounts the real App and clicks through it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';
import { __testing as supabaseTesting } from './lib/supabase';
import { APP_URL } from './lib/appInfo';
import { sharePayload } from './lib/share';
import { __robinTesting as robinTesting } from './lib/robins';
import type { Schedule, Round, CourtAssignment } from './types';

/**
 * The service worker's update store, under this file's control.
 *
 * vi.hoisted because vi.mock is lifted above the imports, and the factory would
 * otherwise close over a binding that has not been initialised when App is
 * first pulled in. Idle by default, so the other 270 tests in this file see
 * exactly what they saw before: no banner, and nothing ever applied.
 */
const swUpdate = vi.hoisted(() => {
  let state: 'none' | 'ready' = 'none';
  const listeners = new Set<() => void>();
  return {
    applied: { count: 0 },
    store: {
      get: () => state,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      }
    },
    set(next: 'none' | 'ready') {
      state = next;
      for (const listener of listeners) listener();
    }
  };
});

vi.mock('./lib/appUpdate', () => ({
  updateStore: swUpdate.store,
  applyUpdate: () => void (swUpdate.applied.count += 1),
  startAppUpdates: () => {}
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Long enough for the Actions sheet to finish sliding out and unmount. */
const SHEET_GONE_MS = 400;

const NAMES = [
  'Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kit', 'Lex',
];

/** Seeds a group of `inGroup` players with the first `selected` of them attending. */
function seed(inGroup: number, selected: number, courts: number, scoring = false) {
  window.localStorage.clear();
  const players = NAMES.slice(0, inGroup).map((name, i) => ({
    id: `p${i + 1}`,
    name,
    rating: 3.5 + (i % 4) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  }));
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Test Group' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem('pb-roster', JSON.stringify(players));
  window.localStorage.setItem(
    'pb-selected-ids',
    JSON.stringify(players.slice(0, selected).map((p) => p.id))
  );
  window.localStorage.setItem('pb-num-courts', JSON.stringify(courts));
  window.localStorage.setItem('pb-num-rounds', JSON.stringify(8));
  window.localStorage.setItem('pb-scoring-enabled', JSON.stringify(scoring));
  runMigrations();
}

/**
 * Writes a score into the first board on screen, which is round 1. Needs a
 * session seeded with scoring on.
 *
 * At module scope because two things want it: the Reshuffle warning, and the
 * one before Set Round Types opens. Both turn on there being real work on the
 * board, and a score is the cheapest way to put some there.
 */
function scoreFirstCourt(left: string, right: string) {
  const board = [...container.querySelectorAll('button[aria-haspopup="dialog"]')].find((b) =>
    (b.getAttribute('aria-label') ?? '').includes('score')
  );
  if (!board) throw new Error('no scoreboard on screen; is scoring on?');
  click(board as HTMLElement);

  const box = container.querySelector('[role="dialog"][aria-label*="score"]') as HTMLElement;
  const key = (face: string) => {
    const pad = box.querySelector('[aria-label="Score keypad"]')!;
    click([...pad.querySelectorAll('button')].find((b) => text(b) === face)!);
  };
  key('Clear');
  for (const d of left) key(d);
  click([...box.querySelectorAll('[aria-label^="Score for"]')][1] as HTMLElement);
  for (const d of right) key(d);
  clickButton(/^Save$/, box);
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

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * The pane the app scrolls in. The document is held still — see the scroll
 * architecture at the top of index.css — so everything that used to be asked
 * of window (scrollTo on a step change, the freeze under a dialog) happens to
 * this element, and this is where the tests look for it.
 */
function scroller(): HTMLElement {
  const pane = container.querySelector<HTMLElement>('[data-app-scroll]');
  if (!pane) throw new Error('no scroll pane mounted');
  return pane;
}

/**
 * A relaunch: the app all the way down and up again, with an optional change to
 * what is in storage in between.
 *
 * The unmount is load-bearing. A store hands back its cache while anything is
 * subscribed to it, so a second mount over a live first one would read the old
 * values however the seed was changed.
 */
function remount(between?: () => void) {
  act(() => root.unmount());
  container.remove();
  between?.();
  mount();
}

function text(el: Element): string {
  return (el.textContent ?? '').trim();
}

function buttons(re: RegExp, scope: ParentNode = container): HTMLElement[] {
  return [...scope.querySelectorAll('button, [role="button"]')].filter((b) =>
    re.test(text(b))
  ) as HTMLElement[];
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function clickButton(re: RegExp, scope: ParentNode = container) {
  const found = buttons(re, scope);
  if (found.length === 0) {
    throw new Error(
      `no button matching ${re}; saw: ${[...scope.querySelectorAll('button')]
        .map((b) => JSON.stringify(text(b).slice(0, 30)))
        .join(', ')}`
    );
  }
  click(found[0]);
}

/**
 * The round card whose heading reads "Round N". Anchored at both ends rather
 * than matched on a prefix, so Round 1 cannot answer for Round 10.
 */
function roundCard(n: number): HTMLElement {
  const heading = new RegExp(`^Round ${n}$`);
  const card = [...container.querySelectorAll('.round-card')].find((c) =>
    heading.test(text(c.querySelector('h3') ?? c))
  );
  if (!card) throw new Error(`no card for Round ${n}`);
  return card as HTMLElement;
}

/**
 * The card plus the format tab sitting on top of it, which is outside the card
 * itself — see RoundTypeBadge for why it is drawn there.
 */
function roundBlock(n: number): HTMLElement {
  return roundCard(n).parentElement as HTMLElement;
}

function checkbox(n: number): HTMLInputElement {
  return roundCard(n).querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function markComplete(n: number) {
  click(checkbox(n));
}

function storedSchedule(): Schedule {
  return JSON.parse(window.localStorage.getItem('pb-schedule') ?? 'null');
}

function completedRounds(): number[] {
  return JSON.parse(window.localStorage.getItem('pb-completed-rounds') ?? '[]').sort(
    (a: number, b: number) => a - b
  );
}

/** A round as a comparable string: courts, teams and sit-outs by name. */
function fingerprint(round: Round): string {
  const courts = round.courts
    .map((c) => `${c.team1.map((p) => p.name).join('+')} vs ${c.team2.map((p) => p.name).join('+')}`)
    .join(' | ');
  return `R${round.roundNumber}: ${courts} // out: ${round.sitOuts.map((p) => p.name).join(',')}`;
}

/** How many genders are on a court. One means it is a gendered court. */
function genderCount(court: CourtAssignment): number {
  return new Set([...court.team1, ...court.team2].map((p) => p.gender)).size;
}

function onCourt(round: Round): string[] {
  return round.courts.flatMap((c) => [...c.team1, ...c.team2]).map((p) => p.name);
}

function generate() {
  clickButton(/^Continue to Setup/);
  clickButton(/^Generate Schedule/);
}

/**
 * Off the schedule to Setup, the way a host does it.
 *
 * Setup asks every time there is a schedule, touched or not, and answering yes
 * is what throws it away — so a test that needs its afternoon still standing on
 * the Setup tab cannot come this way. Those relaunch instead: see `parkOnSetup`.
 *
 * Players asks nothing and needs none of this: click the tab.
 */
function leaveSchedule(target: RegExp) {
  clickButton(target);
  if (/Abandon This Schedule\?/.test(container.textContent ?? '')) {
    clickButton(/^Return to /);
  }
}

/**
 * A relaunch that comes back up on Setup with the session still in storage.
 *
 * There is no longer a way to walk there with an afternoon in play, which is
 * the whole point of the change. This is a host who was on Setup when they last
 * closed the app, and it is how the round types list is reached in the tests
 * that check what it does to rounds already played.
 */
function parkOnSetup() {
  remount(() => window.localStorage.setItem('pb-step', JSON.stringify('setup')));
}

/** The same relaunch, coming back up on the Players tab. */
function parkOnPlayers() {
  remount(() => window.localStorage.setItem('pb-step', JSON.stringify('roster')));
}

/** The Actions sheet, found by its role rather than by position. */
function sheet(): HTMLElement {
  const found = container.querySelector('[role="dialog"]');
  if (!found) throw new Error('the Actions sheet is not open');
  return found as HTMLElement;
}

/** Opens the Actions sheet and taps one of the nine cards on it. */
function action(label: RegExp) {
  clickButton(/^Actions$/);
  clickButton(label, sheet());
}

/**
 * Opens the menu behind one player's place on a round.
 *
 * Three steps, because a place on a court does three things: tapping it selects
 * it for a swap, which is what reveals the edit button, which is what opens the
 * menu. Nothing has happened to the player yet when this returns.
 */
function openPlayerMenu(name: string, round = 1) {
  const card = roundCard(round);
  clickButton(new RegExp(`^${name}`), card);
  const edit = card.querySelector(`[aria-label="Edit ${name}"]`);
  if (!edit) throw new Error(`no edit button for ${name} on round ${round}`);
  click(edit);
}

/**
 * Starts a substitution the only way there is one: tap the player coming off,
 * then Sub Someone In. It lands on the sheet's second question, because the
 * first was answered by whose name was tapped.
 */
function subIn(name: string, round = 1) {
  openPlayerMenu(name, round);
  clickButton(/^Sub Someone In$/);
}

/** Takes somebody off the rounds still to be played, confirmation and all. */
function takeOff(name: string, round = 1) {
  openPlayerMenu(name, round);
  clickButton(/^Remove Player$/);
  // "Remove", not "Yes": the confirm is a tile with a glyph on it now, and a
  // tile saying Yes next to a person-shaped icon names nothing.
  clickButton(/^Remove$/);
}

/**
 * The whole of a reshuffle: the card, then the button on the panel it opens.
 *
 * The card no longer does anything on its own. Reshuffle throws away every round
 * not yet played, so it asks first, and Rebuild is the one that means it. That
 * button counts the rounds it is about to rebuild, so it is matched by shape
 * rather than by a fixed string.
 */
const REBUILD = /^Rebuild \d+ Rounds?$/;

function reshuffle() {
  action(/^Reshuffle$/);
  clickButton(REBUILD, sheet());
}

/** The stored guest list, which is where a guest lives instead of the pool. */
function storedGuests(): { id: string; name: string; guest?: true }[] {
  return JSON.parse(window.localStorage.getItem('pb-guests') ?? '[]');
}

function storedPlayers(): { id: string; name: string; rating: number; gender: string }[] {
  return JSON.parse(window.localStorage.getItem('pb-roster') ?? '[]');
}

/** One of them by name, for the edits that have to be shown to have landed. */
function storedPlayer(name: string) {
  const found = storedPlayers().find((p) => p.name === name);
  if (!found) throw new Error(`no stored player called ${name}`);
  return found;
}

const courtsOf = (round: Round) => round.courts.map((c) => c.courtNumber);

/** Clicks a control by its label, for the ones whose face is a plus or a minus. */
function clickLabel(label: string, scope: ParentNode = container) {
  const el = scope.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no control labelled ${label}`);
  click(el);
}

describe('9 players / 2 courts', () => {
  beforeEach(() => seed(9, 9, 2));

  it('step 3 — Reshuffle leaves completed rounds 1-3 alone and still ticked', () => {
    mount();
    generate();

    const before = storedSchedule();
    expect(before.rounds).toHaveLength(8);

    markComplete(1);
    markComplete(2);
    markComplete(3);
    expect(completedRounds()).toEqual([1, 2, 3]);

    const kept = before.rounds.slice(0, 3).map(fingerprint);
    const rest = before.rounds.slice(3).map(fingerprint);

    reshuffle();

    const after = storedSchedule();
    expect(after.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // The point of the fix: played rounds survive verbatim, and stay ticked.
    expect(after.rounds.slice(0, 3).map(fingerprint)).toEqual(kept);
    expect(completedRounds()).toEqual([1, 2, 3]);
    for (const n of [1, 2, 3]) {
      expect(checkbox(n).checked, `Round ${n} still ticked`).toBe(true);
    }

    // And the reshuffle actually did something, or the check above proves nothing.
    expect(after.rounds.slice(3).map(fingerprint)).not.toEqual(rest);
  });

  it('a removed player comes back onto the Add Player list', () => {
    mount();
    generate();

    const victim = storedSchedule().rounds[0].courts[0].team1[0];
    takeOff(victim.name);

    action(/^Add Player$/);
    expect(text(sheet())).toContain('Who is joining?');
    const offered = buttons(/./, sheet()).map(text);
    expect(offered.filter((t) => t.includes(victim.name))).toHaveLength(1);
  });

  it('offers nobody to add while the whole group is already playing', () => {
    mount();
    generate();

    action(/^Add Player$/);
    expect(text(sheet())).toContain('Everyone in this group is already playing');
  });
});

describe('the swap hint', () => {
  beforeEach(() => seed(9, 9, 2));

  const HINT = 'Tap a player, then tap another to swap them';

  it('is closed once and never comes back, not even on a new session', () => {
    // The complaint was that it was a permanent fixture. Dismissing it has to
    // outlive the page, so this relaunches the app rather than re-rendering it.
    mount();
    generate();
    expect(container.textContent).toContain(HINT);

    click(container.querySelector('button[aria-label="Dismiss"]')!);
    expect(container.textContent).not.toContain(HINT);

    // Away and back, the way a home-screen app is closed and opened.
    act(() => root.unmount());
    container.remove();
    mount();
    expect(container.textContent).not.toContain(HINT);

    // And a brand new session, which is where it used to reappear.
    action(/^New Round Robin$/);
    clickButton(/^Yes, Start New$/, sheet());
    generate();
    expect(container.textContent).not.toContain(HINT);
  });
});

/**
 * The mark a swap leaves behind it.
 *
 * Two names change over on a grid of names, and on a phone held at arm's length
 * it is very easy to miss which two. So both places take a strong edge for two
 * seconds and let it fade back to the line they were resting on. Everything
 * about the fade itself is CSS — see `seat-swapped` in index.css, and there is
 * no layout in happy-dom to look at anyway. What is checkable here is which
 * places wear it, for how long, and that a second swap is a second mark.
 */
describe('the mark a swap leaves', () => {
  beforeEach(() => {
    seed(9, 9, 2);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  /** Which places are marked, by name, wherever they are on the page. */
  function marked(scope: ParentNode = container): string[] {
    return [...scope.querySelectorAll('.seat-swapped')]
      .map((el) => NAMES.find((n) => text(el).startsWith(n)) ?? text(el))
      .sort();
  }

  /** One place on Round 1, found by whoever is standing in it now. */
  function seat(name: string, round = 1): HTMLElement {
    const found = buttons(new RegExp(`^${name}`), roundCard(round))[0];
    if (!found) throw new Error(`nobody called ${name} on round ${round}`);
    return found;
  }

  function swap(a: string, b: string, round = 1) {
    clickButton(new RegExp(`^${a}`), roundCard(round));
    clickButton(new RegExp(`^${b}`), roundCard(round));
  }

  it('marks both places, and nothing in any other round', () => {
    mount();
    generate();

    const first = storedSchedule().rounds[0];
    const a = first.courts[0].team1[0].name;
    const b = first.courts[1].team1[0].name;
    swap(a, b);

    expect(marked(roundCard(1))).toEqual([a, b].sort());
    // The same two people are in all eight rounds. Marking them everywhere
    // would say the swap moved somebody for the whole afternoon.
    expect(marked()).toHaveLength(2);
  });

  it('hands the place back after two seconds', () => {
    mount();
    generate();

    const first = storedSchedule().rounds[0];
    swap(first.courts[0].team1[0].name, first.courts[1].team1[0].name);
    expect(marked()).toHaveLength(2);

    act(() => vi.advanceTimersByTime(2000));
    expect(marked()).toHaveLength(0);
  });

  it('marks a sit-out who has just come on, and the player who went off', () => {
    mount();
    generate();

    const first = storedSchedule().rounds[0];
    const out = first.sitOuts[0].name;
    const on = first.courts[0].team1[0].name;
    swap(out, on);

    expect(marked(roundCard(1))).toEqual([on, out].sort());
  });

  it('marks the one place a move into a gap changes', () => {
    // Nobody changed places with them — they walked into an empty court. It is
    // the same gesture and worth the same mark, and the place they came from is
    // a gap now with nothing on it to see.
    seed(11, 11, 3);
    mount();
    generate();

    const mover = storedSchedule().rounds[0].courts[0].team1[0].name;
    click(buttons(/^EMPTY$/, roundCard(1))[0]);
    clickButton(new RegExp(`^${mover}`), roundCard(1));

    expect(marked(roundCard(1))).toEqual([mover]);
  });

  it('starts the fade over when the same two change back inside the window', () => {
    // The class alone would not do it. The element is already wearing it, so
    // the browser carries on with a fade that is most of the way through and
    // the second swap looks like it did not register. The React key carries
    // which swap marked the place, so a second one builds a new element and the
    // animation runs from the top.
    //
    // Two on the same team on purpose: they change places inside one column, so
    // React would otherwise reorder the two elements it already has and hand
    // the same two back.
    mount();
    generate();

    const team = storedSchedule().rounds[0].courts[0].team1;
    const [one, two] = team.map((p) => p.name);

    swap(one, two);
    const wasMarked = seat(one);
    expect(wasMarked.className).toContain('seat-swapped');

    act(() => vi.advanceTimersByTime(500));
    swap(one, two);

    expect(seat(one)).not.toBe(wasMarked);
    expect(seat(one).className).toContain('seat-swapped');
  });

  it('names the colour to fade from, per side of the court', () => {
    // The animation reads it off the element and has no idea what colour a
    // place rests on, which is what lets one keyframe serve a blue court, an
    // orange one and a grey sit-out chip.
    mount();
    generate();

    const first = storedSchedule().rounds[0];
    swap(first.courts[0].team1[0].name, first.courts[0].team2[0].name);

    const froms = [...container.querySelectorAll('.seat-swapped')].map((el) =>
      (el as HTMLElement).style.getPropertyValue('--seat-swapped-from')
    );
    expect(froms).toHaveLength(2);
    expect(new Set(froms).size).toBe(2);
    for (const from of froms) expect(from).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('names the fill to fade from too, and it is the shade a selected place wears', () => {
    // The edge alone was too quiet to catch on a phone, so the whole place
    // lights up now. It has to start on exactly the colour that was under the
    // host's finger a moment ago, which means the theme variable the selected
    // class compiles to rather than a hex — Tailwind v4's palette is OKLCH and
    // blue-200's old hex is no longer the colour on the screen.
    mount();
    generate();

    const first = storedSchedule().rounds[0];
    swap(first.courts[0].team1[0].name, first.courts[0].team2[0].name);

    const seats = [...container.querySelectorAll('.seat-swapped')] as HTMLElement[];
    expect(seats).toHaveLength(2);

    const fills = seats.map((el) => el.style.getPropertyValue('--seat-swapped-fill'));
    // One per side of the court, and neither is a hex.
    expect(fills.sort()).toEqual(['var(--color-blue-200)', 'var(--color-orange-200)']);

    // And that really is what the selected class resolves to. A place wearing
    // bg-blue-200 while selected but fading from anything else would start the
    // animation on a colour the host never saw.
    for (const el of seats) {
      const fill = el.style.getPropertyValue('--seat-swapped-fill');
      const shade = fill.replace('var(--color-', '').replace(')', '');
      expect(el.className).toMatch(new RegExp(`bg-(blue|orange)-50\\b`));
      expect(['blue-200', 'orange-200']).toContain(shade);
    }
  });

  it('gives a sit-out chip a fill to fade from as well', () => {
    // Every user of the keyframe has to hand in both colours. An undefined
    // custom property is not "no rule": var() with nothing behind it makes the
    // whole declaration invalid, and the chip would fade in from transparent.
    mount();
    generate();

    const first = storedSchedule().rounds[0];
    swap(first.courts[0].team1[0].name, first.sitOuts[0].name);

    const seats = [...container.querySelectorAll('.seat-swapped')] as HTMLElement[];
    expect(seats).toHaveLength(2);
    for (const el of seats) {
      expect(el.style.getPropertyValue('--seat-swapped-from')).not.toBe('');
      expect(el.style.getPropertyValue('--seat-swapped-fill')).not.toBe('');
    }
  });
});

/**
 * The offer of an account, phase 2b of the accounts plan.
 *
 * Held back until phase 4 shipped, because until then its promise was not true:
 * there was no pull, so a new phone got nothing back. It is the only part of
 * accounts a host who never signs in would see, so what is tested here is
 * mostly the gate — who is spared it — rather than what it says.
 *
 * The install banner never appears in these tests: `installRoute` answers
 * 'manual' for a browser with no prompt and no iOS, which is happy-dom, so the
 * one-at-a-time rule in App never suppresses this one here.
 */
describe('the sign-in banner', () => {
  const LINE = 'Create a free account to keep them safe';

  /** A build with Supabase configured, which is what production is. */
  function withDatabase(run: () => void) {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test');
    try {
      run();
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it('is not offered at all when there is no database behind it', () => {
    // The suite's default state, and a build made without the env vars. An
    // account cannot be made, so it must not be asked for.
    seed(9, 9, 2);
    mount();
    expect(container.textContent).not.toContain(LINE);
  });

  it('waits for a roster worth keeping', () => {
    withDatabase(() => {
      seed(3, 3, 1);
      mount();
      expect(container.textContent).not.toContain(LINE);

      // Unmounted, not just detached: a store with a live subscriber keeps its
      // cache, so the second mount would read the first one's three players.
      remount(() => seed(4, 4, 1));
      expect(container.textContent).toContain(LINE);
    });
  });

  it('is not shown to somebody already signed in on this device', () => {
    // Read from localStorage rather than from the auth store, which says
    // 'unknown' until the Supabase client has loaded. The banner would
    // otherwise flash on every launch at the one person it is not for.
    withDatabase(() => {
      seed(9, 9, 2);
      window.localStorage.setItem('sb-example-auth-token', '{"access_token":"x"}');
      mount();
      expect(container.textContent).not.toContain(LINE);
    });
  });

  it('opens My Account when it is taken up', () => {
    withDatabase(() => {
      seed(9, 9, 2);
      mount();
      clickButton(/^Sign In$/);
      expect(container.querySelector('img[src="/account-top.png"]')).not.toBeNull();
    });
  });

  it('goes away for good when it is waved off', () => {
    withDatabase(() => {
      seed(9, 9, 2);
      mount();
      const cross = [...container.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === 'Dismiss'
      )!;
      click(cross);
      expect(container.textContent).not.toContain(LINE);

      // And on the next launch. This one is remembered, unlike the update line.
      remount();
      expect(container.textContent).not.toContain(LINE);
    });
  });

  /**
   * The settings drawer says which way round it is, so somebody can tell
   * whether their groups are being kept without opening the panel to find out.
   */
  describe('the account item in the settings menu', () => {
    function accountLabel(): string {
      const item = buttons(/^My Account/)[0];
      if (!item) throw new Error('no My Account item in the settings drawer');
      return text(item);
    }

    it('says signed out when there is no session', () => {
      withDatabase(() => {
        seed(9, 9, 2);
        mount();
        expect(accountLabel()).toBe('My Account (signed out)');
      });
    });

    it('says signed in when a session is stored', () => {
      withDatabase(() => {
        seed(9, 9, 2);
        // The same stored-token signal the banner test above relies on.
        window.localStorage.setItem('sb-example-auth-token', '{"access_token":"x"}');
        mount();
        expect(accountLabel()).toBe('My Account (signed in)');
      });
    });
  });

  /**
   * The loop, end to end, in the real App.
   *
   * Tapping a sign-in link on a phone lands here signed out: the link only
   * works in the browser that asked for it, and the mail app opens a different
   * one. My Account opens by itself, which is right. What was wrong is what it
   * then said, which was nothing at all, so the panel was indistinguishable
   * from the one the person had just left. They typed their address again, got
   * another email, tapped the link again, and went round.
   *
   * Both halves are asserted together because either alone is worthless: a
   * panel that opens and explains nothing is the bug, and an explanation nobody
   * is shown is not a fix.
   */
  describe('arriving back from a link that did not work', () => {
    /** withDatabase, but able to wait for the Supabase client to load. */
    async function withDatabaseAsync(run: () => Promise<void>) {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test');
      try {
        await run();
      } finally {
        vi.unstubAllEnvs();
      }
    }

    /** A page load at `url`, with the last one's arrival forgotten. */
    function arriveAt(url: string) {
      window.history.replaceState({}, '', url);
      supabaseTesting.reset();
    }

    /** Lets the dynamic import of the client, and getSession after it, settle. */
    async function settle() {
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      }
    }

    afterEach(() => arriveAt('/'));

    it('opens My Account and says the link expired', async () => {
      await withDatabaseAsync(async () => {
        seed(9, 9, 2);
        arriveAt('/?error=access_denied&error_code=otp_expired');
        mount();

        // Opened without anyone touching the menu, which is the half that
        // already worked.
        expect(container.querySelector('img[src="/account-top.png"]')).not.toBeNull();

        await settle();
        expect(container.textContent).toContain(
          'That link has expired. Ask for a new code below.'
        );
        // And it is still a working sign-in screen underneath it.
        expect(container.querySelector('#acct-email')).not.toBeNull();
      });
    });

    it('sends someone to the code when the link simply did not work here', async () => {
      await withDatabaseAsync(async () => {
        seed(9, 9, 2);
        arriveAt('/?code=abc123');
        mount();

        await settle();
        expect(container.textContent).toContain(
          'That link did not sign you in. Ask for a code below instead.'
        );
      });
    });

    it('says nothing of the sort when My Account is opened from the menu', async () => {
      await withDatabaseAsync(async () => {
        seed(9, 9, 2);
        arriveAt('/');
        mount();
        clickButton(/^Sign In$/);

        await settle();
        expect(container.textContent).not.toContain('That link');
      });
    });
  });

  /**
   * The same loop, entered a different way, and the way a real host hit it.
   *
   * Reading the emailed code means leaving Safari for the mail app. iOS reloads
   * the tab while it is away often enough to be the ordinary case, and every
   * panel the app had open is component state: it does not come back. What came
   * back was the schedule, with the code on the clipboard and nothing on screen
   * that had asked for one. Opening My Account again offered the email field,
   * which sends a second code to exactly the same place.
   *
   * Landing back on the code box is the whole fix. The rules the record keeps
   * are in lib/pendingSignIn.test.ts; this is the App doing it.
   */
  describe('coming back to a page that reloaded while the code was being fetched', () => {
    /** A code sent moments ago, the way a reloaded page finds one waiting. */
    function codeAlreadySent(email = 'host@example.com') {
      window.localStorage.setItem(
        'pb-pending-signin',
        JSON.stringify({ email, sentAt: Date.now() })
      );
    }

    function accountIsOpen() {
      return container.querySelector('img[src="/account-top.png"]') !== null;
    }

    it('opens My Account by itself, on the box for the code', () => {
      seed(9, 9, 2);
      codeAlreadySent();
      mount();

      expect(accountIsOpen(), 'My Account did not open').toBe(true);
      expect(container.textContent).toContain('Check your email');
      expect(container.querySelector('#acct-code')).not.toBeNull();
      // The field that sends another one is what the loop was made of.
      expect(container.querySelector('#acct-email')).toBeNull();
    });

    it('leaves the app alone when no code is out', () => {
      seed(9, 9, 2);
      mount();

      expect(accountIsOpen()).toBe(false);
    });

    it('leaves the app alone once the code is too old to be worth typing', () => {
      seed(9, 9, 2);
      window.localStorage.setItem(
        'pb-pending-signin',
        JSON.stringify({
          email: 'host@example.com',
          sentAt: Date.now() - 2 * 60 * 60 * 1000
        })
      );
      mount();

      expect(accountIsOpen()).toBe(false);
    });

    /**
     * Restoring the panel and nagging with it are different things. Somebody
     * who shuts it has said they are done for now, and an app that puts it back
     * up on every launch for the rest of the hour is arguing with them.
     */
    it('stops letting itself in once the host has closed it', () => {
      seed(9, 9, 2);
      codeAlreadySent();
      mount();
      clickButton(/^Close$/);

      expect(accountIsOpen()).toBe(false);

      remount();
      expect(accountIsOpen(), 'it opened itself again after being closed').toBe(false);
    });

    /**
     * The symptom as it was reported: My Account opened from the settings menu
     * offering the email field, for an address that had a live code sitting in
     * the inbox. This is the route a host takes once they have given up waiting
     * for the app to explain itself, so it has to end somewhere useful.
     */
    it('still has the code box waiting when they open it themselves', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test');
      try {
        seed(9, 9, 2);
        codeAlreadySent();
        mount();
        clickButton(/^Close$/);
        remount();

        // The banner's own button, which is the same panel the settings menu
        // item opens.
        clickButton(/^Sign In$/);
        // The Supabase client is a dynamic import, and the panel says
        // "Checking..." until it answers.
        for (let i = 0; i < 10; i++) {
          await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
          });
        }

        // Closing the panel is not the same as saying the code was no good.
        // The one thing they came back for is the first thing on it.
        expect(container.querySelector('#acct-code')).not.toBeNull();
        expect(container.textContent).toContain('Check your email');
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});

describe('court numbers', () => {
  beforeEach(() => seed(9, 9, 2));

  /** What every round in the saved session calls its first court. */
  function courtNumbers(): number[] {
    return storedSchedule().rounds.map((r) => r.courts[0].courtNumber);
  }

  function renameCourt(roundNumber: number, label: string, value: string) {
    clickButton(new RegExp(`^${label}$`), roundCard(roundNumber));
    const box = container.querySelector('[role="dialog"][aria-label="Court number"]')!;
    const pad = box.querySelector('[aria-label="Court number keypad"]')!;
    // The first digit replaces what the court is called now, so the whole
    // number can just be typed.
    for (const d of value) {
      clickButton(new RegExp(`^${d}$`), pad);
    }
    clickButton(/^Done$/, box);
  }

  it('are kept through a reshuffle, and the played round keeps the one it was played on', () => {
    // A reshuffle throws the unplayed rounds away and builds them again,
    // numbered from 1. The court itself has not moved across the hall.
    mount();
    generate();
    markComplete(1);
    renameCourt(2, 'COURT 1', '7');
    expect(courtNumbers()).toEqual([1, 7, 7, 7, 7, 7, 7, 7]);

    reshuffle();
    expect(courtNumbers()).toEqual([1, 7, 7, 7, 7, 7, 7, 7]);
  });
});

describe('10 in the group, 9 playing / 2 courts', () => {
  beforeEach(() => seed(10, 9, 2));

  it('step 4 — Add Player joins the unplayed rounds only, and reshuffles in', () => {
    mount();
    generate();

    markComplete(1);
    markComplete(2);
    markComplete(3);
    const before = storedSchedule();
    const kept = before.rounds.slice(0, 3).map(fingerprint);

    action(/^Add Player$/);
    expect(text(sheet())).toContain('Who is joining?');
    clickButton(/^Jo/, sheet());

    const added = storedSchedule();
    // Completed rounds untouched; Jo sits out every unplayed round.
    expect(added.rounds.slice(0, 3).map(fingerprint)).toEqual(kept);
    for (const r of added.rounds.slice(0, 3)) {
      expect(r.sitOuts.map((p) => p.name)).not.toContain('Jo');
    }
    for (const r of added.rounds.slice(3)) {
      expect(r.sitOuts.map((p) => p.name), `Round ${r.roundNumber}`).toContain('Jo');
      expect(onCourt(r)).not.toContain('Jo');
    }

    // Swap Jo onto a court in round 4 by tapping her, then a court player.
    const card4 = roundCard(4);
    const courtPlayer = added.rounds[3].courts[0].team1[0].name;
    clickButton(/^Jo/, card4);
    clickButton(new RegExp(`^${courtPlayer}`), card4);
    const swapped = storedSchedule();
    expect(onCourt(swapped.rounds[3])).toContain('Jo');
    expect(swapped.rounds[3].sitOuts.map((p) => p.name)).toContain(courtPlayer);
    expect(window.localStorage.getItem('pb-schedule-edited')).toBe('true');

    // Reshuffle: rounds 1-3 still verbatim, and round 4 sits the people who have
    // sat least — never Jo, who has played nothing.
    reshuffle();
    const after = storedSchedule();
    expect(after.rounds.slice(0, 3).map(fingerprint)).toEqual(kept);
    expect(completedRounds()).toEqual([1, 2, 3]);

    const satAlready = new Set(after.rounds.slice(0, 3).flatMap((r) => r.sitOuts.map((p) => p.name)));
    expect(after.rounds[3].sitOuts.map((p) => p.name)).not.toContain('Jo');
    for (const p of after.rounds[3].sitOuts) {
      expect(satAlready.has(p.name), `${p.name} sat in rounds 1-3 yet sits again in 4`).toBe(false);
    }
  });
});

describe('9 in the group, 8 playing / 2 courts (nobody sits out)', () => {
  beforeEach(() => seed(9, 8, 2));

  it('step 5 — the sit-out row is gone entirely, not left empty', () => {
    // It used to render with no label so it could carry an Add Player button.
    // With that button back in the Actions sheet there is nothing to hold up.
    mount();
    generate();

    expect(storedSchedule().rounds.every((r) => r.sitOuts.length === 0)).toBe(true);
    expect(container.textContent).not.toContain('Sitting out');
    expect(buttons(/Add Player/)).toHaveLength(0);
  });
});

describe('steps 1 and 2 — all-groups export, then import on a clean device', () => {
  /** Seeds two groups with Ava in both. */
  function seedTwoGroups() {
    window.localStorage.clear();
    window.localStorage.setItem(
      'pb-rosters',
      JSON.stringify([
        { id: 'g1', name: 'Tuesday' },
        { id: 'g2', name: 'Thursday' },
      ])
    );
    window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
    window.localStorage.setItem(
      'pb-roster',
      JSON.stringify([
        { id: 'p1', name: 'Ava', rating: 4.0, gender: 'F', rosterIds: ['g1', 'g2'] },
        { id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1'] },
        { id: 'p3', name: 'Cara', rating: 4.5, gender: 'F', rosterIds: ['g2'] },
      ])
    );
    runMigrations();
  }

  /** The Import/Export overlay. Scoped rather than reached for by tag: the
      panel's is the only <select> on this screen today, and a page behind it
      growing one would quietly hand this test the wrong control. */
  function panel(): HTMLElement {
    const found = [...container.querySelectorAll('.fixed.inset-0')].find((d) =>
      text(d).includes('Export as CSV')
    );
    if (!found) throw new Error('Import/Export panel not open');
    return found as HTMLElement;
  }

  function openImportExport() {
    click(container.querySelector('[aria-label="Open settings"]')!);
    clickButton(/^Import \/ Export Groups$/);
  }

  it('round-trips both groups, with the shared player arriving once in both', async () => {
    seedTwoGroups();
    mount();
    openImportExport();

    // Capture what the browser would have been handed to download.
    let csv = '';
    const blobs: Blob[] = [];
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((b: Blob | MediaSource) => {
        blobs.push(b as Blob);
        return 'blob:stub';
      });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const select = panel().querySelector('select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toContain('__all__');
    expect(select.value).toBe('__all__'); // defaults to All Groups with more than one
    clickButton(/^Export as CSV$/, panel());
    expect(createUrl).toHaveBeenCalled();
    csv = await blobs[0].text();
    vi.restoreAllMocks();

    // A row per player per group, so the two-group player is in there twice.
    const rows = csv.trim().split('\n').slice(1).filter(Boolean);
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.includes('Ava'))).toHaveLength(2);
    expect(csv).toContain('Tuesday');
    expect(csv).toContain('Thursday');

    // Now the private window: a clean install importing that file.
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    runMigrations();
    mount();
    openImportExport();

    const input = panel().querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([csv], 'pickleball-groups.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('2 groups imported.');

    const rosters = JSON.parse(window.localStorage.getItem('pb-rosters')!);
    const names = rosters.map((r: { name: string }) => r.name);
    expect(names).toContain('Tuesday');
    expect(names).toContain('Thursday');

    const players = JSON.parse(window.localStorage.getItem('pb-roster')!);
    const avas = players.filter((p: { name: string }) => p.name === 'Ava');
    expect(avas, 'Ava must arrive once, not once per group').toHaveLength(1);
    expect(avas[0].rosterIds).toHaveLength(2);

    const idOf = (n: string) => rosters.find((r: { name: string }) => r.name === n).id;
    expect(avas[0].rosterIds).toContain(idOf('Tuesday'));
    expect(avas[0].rosterIds).toContain(idOf('Thursday'));
    // A clean install opens with the 14 sample players; the import lands
    // beside them, never merged into them.
    const imported = players.filter((p: { rosterIds: string[] }) =>
      p.rosterIds.some((id) => id === idOf('Tuesday') || id === idOf('Thursday'))
    );
    expect(imported).toHaveLength(3);
    expect(players).toHaveLength(17);
  });

  /**
   * "0 players added" on an import that worked read as nothing having
   * happened. Everybody in the file was added to the group; the number is the
   * ones who did not exist on this device until now.
   */
  it('counts the people it created, not the people it added to the group', async () => {
    seedTwoGroups();
    mount();
    openImportExport();

    // Ava is already here, in Tuesday. Zed is not here at all.
    const csv = ['Group,Name,Rating,Gender', 'Weekenders,Ava,3.5,F', 'Weekenders,Zed,4.0,M'].join('\n');
    const input = panel().querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([csv], 'weekenders.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('1 new player created.');
    expect(container.textContent).not.toContain('1 player added.');
    // The line under it is the other half, and it is unchanged.
    expect(container.textContent).toContain('1 player already existed and was added to this group.');
  });

  it('heads its two halves Export Groups and Import Groups', () => {
    seedTwoGroups();
    mount();
    openImportExport();
    const heads = [...panel().querySelectorAll('h3')].map(text);
    expect(heads).toContain('Export Groups');
    expect(heads).toContain('Import Groups');
  });
});

describe('step 6 — every step starts at the top', () => {
  beforeEach(() => seed(9, 9, 2));

  it('scrolls to the top on each step change', () => {
    mount();
    // The pane, not the window: the document cannot scroll in this app.
    const scrollTo = vi.fn();
    scroller().scrollTo = scrollTo as never;

    clickButton(/^Continue to Setup/);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });

    scrollTo.mockClear();
    clickButton(/^Generate Schedule/);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});

describe('Set Round Types', () => {
  beforeEach(() => seed(10, 10, 2));

  /** A step tab, for the trips between Setup and the schedule. */
  function stepTab(label: RegExp): HTMLButtonElement {
    const found = [...container.querySelectorAll('nav button')].find((b) => label.test(text(b)));
    if (!found) throw new Error(`no step tab matching ${label}`);
    return found as HTMLButtonElement;
  }

  /**
   * Opens the inline list. It is closed every time Setup is arrived at.
   *
   * It used to ask first, mid-session, because opening it rebuilt the rounds
   * still to be played. Nothing to ask any more: a session under way cannot be
   * reached from this page, so setting a round type here can only change what
   * the next Generate builds.
   */
  function openPlanner() {
    clickButton(/^Set Round Types$/);
  }

  /** A round already played says so after its number, so match either. */
  const planHeading = (n: number | string) => new RegExp(`^Round ${n}( - Done)?$`);

  /** Every row in the list, in the order they are drawn. */
  function planRows(): HTMLElement[] {
    return [...container.querySelectorAll('h4')]
      .filter((h) => planHeading('\\d+').test(text(h)))
      .map((h) => h.parentElement as HTMLElement);
  }

  function planRow(n: number): HTMLElement {
    const row = planRows().find((r) => planHeading(n).test(text(r.querySelector('h4')!)));
    if (!row) throw new Error(`no plan row for Round ${n}`);
    return row;
  }

  /** What the list says each round is, top to bottom. */
  function rowLabels(): string[] {
    return planRows().map((r) => text(r.querySelector('h4')!));
  }

  /** The pill on a row, whether it is a button or a locked span. */
  function pill(n: number): Element {
    const found = planRow(n).lastElementChild;
    if (!found) throw new Error(`no pill on Round ${n}`);
    return found;
  }

  /** Taps a row's pill and picks one of the four. */
  function setRoundType(n: number, label: string) {
    click(pill(n));
    const picker = container.querySelector('[role="dialog"][aria-modal="true"]');
    if (!picker) throw new Error('the round type picker is not open');
    clickButton(new RegExp(`^${label}$`), picker);
  }

  /** Open, set one round, Done. The whole gesture, which most tests want. */
  function planRound(n: number, label: string) {
    openPlanner();
    setRoundType(n, label);
    clickButton(/^Done$/);
  }

  function handle(n: number): Element {
    const found = planRow(n).querySelector(`[aria-label="Move Round ${n}"]`);
    if (!found) throw new Error(`Round ${n} has no drag handle`);
    return found;
  }

  /** An arrow key on a handle, the path a pointer drag cannot be tested on. */
  function press(el: Element, key: string) {
    act(() => {
      el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }

  it('runs from the title to a badge on the schedule', () => {
    mount();
    clickButton(/^Continue to Setup/);

    // Nothing set yet: the title, and a list that has to be opened to say
    // anything. Setup itself does not summarise what is in it.
    expect(container.textContent).toContain('Set Round Types');
    expect(container.querySelector('h4')).toBeNull();

    planRound(2, 'Mixed Round');

    // Shut again, and the choice is kept. The list is where it is read.
    openPlanner();
    expect(text(pill(2))).toBe('Mixed');
    clickButton(/^Done$/);

    clickButton(/^Generate Schedule/);
    expect(text(roundBlock(2))).toContain('Mixed Round');
    expect(text(roundBlock(1))).not.toContain('Mixed Round');
    expect(storedSchedule().rounds[1].roundType).toBe('mixed');
    expect(storedSchedule().rounds[0].roundType).toBeUndefined();
  });

  /**
   * Generate, pressed with the list still open.
   *
   * Done is not a save button and never was: shutting the list keeps what was
   * set, and so does walking off the tab. Generate is the third way out, and it
   * has to keep it too — it is the button directly under the list, and the one
   * a host reaches for once the rounds are the way they want them.
   */
  it('builds from a round set in the open list, with no Done in between', () => {
    mount();
    clickButton(/^Continue to Setup/);
    openPlanner();
    setRoundType(2, 'Gendered Round');

    clickButton(/^Generate Schedule/);

    expect(storedSchedule().rounds[1].roundType).toBe('gendered');
    expect(text(roundBlock(2))).toContain('Gendered Round');
    // And the plan the host was left with is the one they set. The schedule
    // goes on the way to Setup, which is not what this is asking about.
    leaveSchedule(/^2\. Setup$/);
    openPlanner();
    expect(text(pill(2))).toBe('Gendered');
    expect(text(pill(1))).toBe('Normal');
  });

  /**
   * The same press, over a schedule that already exists.
   *
   * Generate takes the draft here too, and having taken it leaves nothing for
   * the way out of the tab to commit. Were it left there, the rebuild that
   * commit runs would be a rebuild of the schedule that was just replaced, and
   * it would land on top of the new one.
   */
  it('replaces a schedule from the open list, and not with the old one', () => {
    mount();
    generate();
    const before = storedSchedule().rounds.map(fingerprint);

    leaveSchedule(/^2\. Setup$/);
    openPlanner();
    setRoundType(3, 'Gendered Round');
    clickButton(/^Generate Schedule/);

    expect(storedSchedule().rounds[2].roundType).toBe('gendered');
    // A new schedule, not the old one handed back with a type painted on.
    expect(storedSchedule().rounds.map(fingerprint)).not.toEqual(before);
  });

  it('draws one row per round, numbered 1 to N top to bottom', () => {
    mount();
    clickButton(/^Continue to Setup/);
    openPlanner();

    expect(rowLabels()).toEqual([
      'Round 1', 'Round 2', 'Round 3', 'Round 4',
      'Round 5', 'Round 6', 'Round 7', 'Round 8',
    ]);
    // Every one of them says what it is, ordinary rounds included.
    expect(text(pill(1))).toBe('Normal');
  });

  /**
   * The decision this whole list is built on. Dragging moves the round type
   * into a different round; it never renumbers the rounds, because a round is
   * where it is in the afternoon and the host cannot move that.
   */
  it('keeps the round number with the position when a row moves', () => {
    mount();
    clickButton(/^Continue to Setup/);
    openPlanner();
    setRoundType(2, 'Mixed Round');

    press(handle(2), 'ArrowUp');

    expect(rowLabels()).toEqual([
      'Round 1', 'Round 2', 'Round 3', 'Round 4',
      'Round 5', 'Round 6', 'Round 7', 'Round 8',
    ]);
    expect(text(pill(1))).toBe('Mixed');
    expect(text(pill(2))).toBe('Normal');
  });

  it('says out loud what moved and where it went', () => {
    mount();
    clickButton(/^Continue to Setup/);
    openPlanner();
    setRoundType(2, 'Mixed Round');
    press(handle(2), 'ArrowUp');

    const live = container.querySelector('[aria-live="polite"]');
    expect(text(live!)).toBe('Mixed moved to Round 1.');
  });

  it('collapses on Done, and is closed again on the way back', () => {
    mount();
    clickButton(/^Continue to Setup/);
    openPlanner();
    expect(planRows()).toHaveLength(8);

    clickButton(/^Done$/);
    expect(planRows()).toHaveLength(0);

    // Open it, walk away, come back: closed. It is a list you finish with, not
    // a panel that stays where you left it.
    openPlanner();
    expect(planRows()).toHaveLength(8);
    click(stepTab(/^1\. Players$/));
    click(stepTab(/^2\. Setup$/));
    expect(planRows()).toHaveLength(0);
  });

  /**
   * The ⓘ explains the three formats and changes nothing. Everything that was
   * a setting on the old panel has gone to the list.
   */
  /**
   * Reset All sits on the title line, outside the list, and so outside the
   * draft the list is keeping. That is the whole difficulty with it: while the
   * list is open, everything the host has just set lives in that draft and the
   * committed plan is still empty. Read the wrong one and the button is greyed
   * out over a list full of rounds they can see they have set.
   */
  describe('Reset All', () => {
    function resetButton(): HTMLButtonElement {
      const found = [...container.querySelectorAll('button')].find(
        (b) => text(b) === 'Reset All'
      );
      if (!found) throw new Error('no Reset All');
      return found as HTMLButtonElement;
    }

    /** Is it on the page at all? It is hidden rather than disabled. */
    function resetShown(): boolean {
      return [...container.querySelectorAll('button')].some((b) => text(b) === 'Reset All');
    }

    /**
     * The pills under a shut Set Round Types, left to right.
     *
     * Read off the panel rather than the whole page so the list's own rows
     * cannot be mistaken for them: with the list open these do not exist, and a
     * loose query would find sixteen rows' worth and call the test green.
     */
    function shutPills(): string[] {
      const list = container.querySelector('[aria-label="Round types in this session"]');
      return list ? [...list.children].map((p) => text(p)) : [];
    }

    /** What each row's pill says, top to bottom. */
    function pillLabels(): string[] {
      return planRows().map((r) => text(r.lastElementChild!));
    }

    /** The committed plan, as it was written to storage. */
    function storedPlan(): (string | null)[] {
      return JSON.parse(window.localStorage.getItem('pb-round-plan') ?? '[]');
    }

    it('is not on the page until there is something to reset', () => {
      mount();
      clickButton(/^Continue to Setup/);
      expect(resetShown()).toBe(false);

      openPlanner();
      // Open, but every round is ordinary. Still nothing to reset.
      expect(resetShown()).toBe(false);

      setRoundType(2, 'Mixed Round');
      expect(resetShown()).toBe(true);
    });

    /**
     * It answers to the draft, not to the committed plan. Read the wrong one
     * and it stays away while the host is looking at a list of rounds they can
     * see they have set.
     */
    it('appears on a round set in the open list, before anything is committed', () => {
      mount();
      clickButton(/^Continue to Setup/);
      openPlanner();
      setRoundType(3, 'Gendered Round');

      expect(storedPlan()[2]).toBeNull();
      expect(resetShown()).toBe(true);
    });

    /**
     * It used to go away with the list, on the reasoning that a shut list left
     * nothing on screen for it to act on. The pills under the shut list are
     * that something now, so the way to undo what they say has to be beside
     * them rather than one tap further in.
     */
    it('stays after the list is shut, beside the pills it would clear', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Mixed Round');

      expect(storedPlan()[1]).toBe('mixed');
      expect(resetShown()).toBe(true);
    });

    it('clears the pills from the shut panel', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Mixed Round');
      expect(shutPills()).toEqual(['Mixed']);

      click(resetButton());
      expect(shutPills()).toEqual([]);
      expect(resetShown()).toBe(false);
    });

    /**
     * What this afternoon is set to play, with the list shut.
     *
     * One pill per format used, however many rounds use it. The question a host
     * is asking at a glance is whether there is a gendered round today, not how
     * many — a count is a number to check against a list that is one tap away.
     */
    describe('the pills under a shut list', () => {
      it('shows nothing at all when every round is ordinary', () => {
        mount();
        clickButton(/^Continue to Setup/);

        expect(shutPills()).toEqual([]);
      });

      it('names a format once, however many rounds are played as it', () => {
        mount();
        clickButton(/^Continue to Setup/);
        openPlanner();
        setRoundType(2, 'Mixed Round');
        setRoundType(4, 'Mixed Round');
        setRoundType(6, 'Mixed Round');
        clickButton(/^Done$/);

        // Not "Mixed x3", and not three pills reading Mixed.
        expect(shutPills()).toEqual(['Mixed']);
      });

      it('names each format in play, in the order the app lists them', () => {
        mount();
        clickButton(/^Continue to Setup/);
        openPlanner();
        // Set out of order on purpose: the row must read the same whichever way
        // round the host happened to choose them.
        setRoundType(2, 'Equal Skill Round');
        setRoundType(3, 'Gendered Round');
        setRoundType(5, 'Mixed Round');
        clickButton(/^Done$/);

        expect(shutPills()).toEqual(['Gendered', 'Mixed', 'Equal Skill']);
      });

      it('says nothing about the ordinary rounds among them', () => {
        mount();
        clickButton(/^Continue to Setup/);
        planRound(2, 'Gendered Round');

        // Every other round is ordinary, and ordinary is not a format.
        expect(shutPills()).toEqual(['Gendered']);
      });

      it('is not drawn while the list is open, where every round says it', () => {
        mount();
        clickButton(/^Continue to Setup/);
        planRound(2, 'Mixed Round');
        expect(shutPills()).toEqual(['Mixed']);

        openPlanner();
        // The same answer twice, a few pixels apart.
        expect(shutPills()).toEqual([]);
      });

      it('carries the shape as well as the word', () => {
        mount();
        clickButton(/^Continue to Setup/);
        planRound(2, 'Gendered Round');

        const list = container.querySelector('[aria-label="Round types in this session"]')!;
        // Gendered takes two: men playing men and women playing women, which
        // one symbol can only say half of.
        expect(list.firstElementChild!.querySelectorAll('svg')).toHaveLength(2);
      });
    });

    it('puts the open list back to Normal', () => {
      mount();
      clickButton(/^Continue to Setup/);
      openPlanner();
      setRoundType(2, 'Mixed Round');
      setRoundType(5, 'Gendered Round');
      expect(pillLabels()).toContain('Mixed');

      click(resetButton());
      expect(pillLabels().every((l) => l === 'Normal')).toBe(true);
      expect(resetShown()).toBe(false);
    });

    it('clears a plan that was already committed', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Mixed Round');
      openPlanner();

      click(resetButton());
      expect(storedPlan()[1]).toBeNull();
      expect(pillLabels().every((l) => l === 'Normal')).toBe(true);

      // And it stays cleared when the list is shut and opened again.
      clickButton(/^Set Round Types$/);
      openPlanner();
      expect(pillLabels().every((l) => l === 'Normal')).toBe(true);
    });

    /**
     * Nothing is going to rebuild a round already on the board, so clearing it
     * would only make the list lie about what happened on court.
     */
    it('leaves a round already played as it was played', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(1, 'Mixed Round');
      clickButton(/^Generate Schedule/);
      markComplete(1);

      parkOnSetup();
      openPlanner();
      setRoundType(3, 'Gendered Round');
      click(resetButton());

      expect(text(pill(1))).toBe('Mixed');
      expect(pillLabels().slice(1).every((l) => l === 'Normal')).toBe(true);
    });

    /**
     * A round already played is not something the host can reset, so it is not
     * a reason to offer them the button. With round 1 played and mixed and
     * nothing else set, the list has nothing in it that can be cleared.
     */
    it('stays away when the only round set is one already played', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(1, 'Mixed Round');
      clickButton(/^Generate Schedule/);
      markComplete(1);

      parkOnSetup();
      openPlanner();
      expect(text(pill(1))).toBe('Mixed');
      expect(resetShown()).toBe(false);
    });
  });

  it('opens an information panel that sets nothing', () => {
    mount();
    clickButton(/^Continue to Setup/);
    click(container.querySelector('[aria-label="About round types"]')!);

    const panel = container.querySelector('.fixed.inset-0')!;
    expect(text(panel)).toContain('Round Types');
    // Named by the pill the host meets on a round card, not by a heading only
    // this panel uses.
    expect(text(panel)).toContain('Equal Skill Round');
    expect(text(panel)).toContain('You play with and against people near your own level.');
    // The one thing about round types a host cannot work out by looking.
    expect(text(panel)).toContain('Special round types come first');
    expect(text(panel)).toContain('A pair from Set Partners is split for that one round');
    // The old name is gone from the words the host reads, here and everywhere.
    expect(text(panel)).not.toContain('game type');

    expect(panel.querySelector('button[role="switch"]')).toBeNull();
    expect(panel.querySelector('select')).toBeNull();
    expect(panel.querySelector('[aria-label^="Move "]')).toBeNull();
    expect(text(panel)).not.toContain('Every 4 rounds means');
  });

  /**
   * Mid-session, the rounds already played are the afternoon. They are in the
   * list so the host can see where they are, and they cannot be touched.
   */
  it('locks the rounds already played', () => {
    mount();
    generate();
    markComplete(1);
    markComplete(2);

    parkOnSetup();
    openPlanner();

    for (const n of [1, 2]) {
      expect(planRow(n).querySelector(`[aria-label="Move Round ${n}"]`)).toBeNull();
      expect(pill(n).tagName).toBe('SPAN');
    }
    // And the rest of the afternoon is still the host's to set.
    expect(handle(3)).toBeDefined();
    expect(pill(3).tagName).toBe('BUTTON');
  });

  /**
   * A locked round used to be told apart only by two controls not being there,
   * which is something you find out by trying to use them. It says so now, and
   * is drawn out of the blue the playable rounds wear.
   */
  it('says DONE on a round already played, and draws it grey', () => {
    mount();
    generate();
    markComplete(1);

    parkOnSetup();
    openPlanner();

    expect(text(planRow(1).querySelector('h4')!)).toBe('Round 1 - Done');
    expect(text(planRow(2).querySelector('h4')!)).toBe('Round 2');

    const done = planRow(1).style.backgroundColor;
    const open = planRow(2).style.backgroundColor;
    expect(done).not.toBe('');
    expect(done).not.toBe(open);
    expect(planRow(1).style.borderColor).not.toBe(planRow(2).style.borderColor);
    // White on grey would be unreadable, so the ink moves with the fill.
    const ink = (planRow(1).querySelector('h4') as HTMLElement).style.color;
    expect(ink).not.toBe('rgb(255, 255, 255)');
  });

  /**
   * The title button used to be a way to lose work by tapping the same thing
   * twice. The draft exists so the Schedule tab does not blink on every pill
   * tap, not as a decision waiting to be confirmed.
   */
  describe('shutting the list without Done', () => {
    it('keeps what was set', () => {
      mount();
      clickButton(/^Continue to Setup/);
      openPlanner();
      setRoundType(3, 'Equal Skill Round');

      // Shut it by the title, not by Done.
      clickButton(/^Set Round Types$/);
      expect(planRows()).toHaveLength(0);
      expect(JSON.parse(window.localStorage.getItem('pb-round-plan')!)[2]).toBe('skill');

      // And it is still there when the list is opened again.
      openPlanner();
      expect(text(pill(3))).toBe('Equal Skill');
    });

    it('rebuilds the afternoon just as Done would', () => {
      mount();
      generate();
      markComplete(1);
      parkOnSetup();
      openPlanner();
      setRoundType(4, 'Gendered Round');
      clickButton(/^Set Round Types$/);

      expect(storedSchedule().rounds[3].roundType).toBe('gendered');
      expect(completedRounds()).toEqual([1]);
    });

    it('commits nothing when nothing was touched', () => {
      mount();
      generate();
      const before = storedSchedule().rounds.map(fingerprint);

      // Relaunched onto Setup rather than walked there, because walking there
      // ends the session and there would be no afternoon left to leave alone.
      parkOnSetup();
      openPlanner();
      clickButton(/^Set Round Types$/);

      expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
    });

    /**
     * Leaving is the third way of closing the list, and it has to mean the same
     * as the other two. The whole page goes with the step, so the draft is
     * caught on the way out.
     */
    it('keeps what was set when the host walks off the tab', () => {
      mount();
      clickButton(/^Continue to Setup/);
      openPlanner();
      setRoundType(2, 'Mixed Round');

      click(stepTab(/^1\. Players$/));
      expect(JSON.parse(window.localStorage.getItem('pb-round-plan')!)[1]).toBe('mixed');

      click(stepTab(/^2\. Setup$/));
      openPlanner();
      expect(text(pill(2))).toBe('Mixed');
    });

    /**
     * The awkward one: the rebuild lands while the host is on their way to the
     * schedule. It has to arrive built, and the tab must not shut behind them,
     * which is the basisKey hazard the plan named.
     */
    it('commits on the way out, and Generate hands the rebuild back', () => {
      mount();
      generate();
      markComplete(1);
      parkOnSetup();
      openPlanner();
      setRoundType(4, 'Gendered Round');

      // The Schedule tab is not a door any more, so walking off the list means
      // pressing the button under it. The commit still has to happen first, or
      // Generate would build from the plan the host started from.
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[3].roundType).toBe('gendered');
      expect(container.textContent).toContain('Actions');
    });

    it('leaves the afternoon alone when the host walks off having set nothing', () => {
      mount();
      generate();
      const before = storedSchedule().rounds.map(fingerprint);

      parkOnSetup();
      openPlanner();
      click(stepTab(/^1\. Players$/));

      expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
    });
  });

  /**
   * What Done still does to an afternoon it finds in storage: the rounds
   * already played keep their scores and their pairings, everything still to
   * come is rebuilt, and nothing asks a question.
   *
   * Reached by relaunching onto Setup, because there is no longer a way to walk
   * there with an afternoon in play — the tab asks, and answering throws it
   * away. The rebuild itself is unchanged, which is what this holds.
   */
  it('rebuilds only what has not been played', () => {
    mount();
    generate();
    markComplete(1);
    const before = fingerprint(storedSchedule().rounds[0]);

    parkOnSetup();
    planRound(4, 'Gendered Round');

    // Nothing was asked, and nothing was thrown away.
    expect(container.textContent).not.toContain('Abandon');
    expect(fingerprint(storedSchedule().rounds[0])).toBe(before);
    expect(completedRounds()).toEqual([1]);
    expect(storedSchedule().rounds[3].roundType).toBe('gendered');

    // Done does not navigate. Generate does, and it hands back what Done just
    // rebuilt rather than making another.
    expect(container.textContent).toContain('Generate Schedule');
    clickButton(/^Generate Schedule/);
    expect(container.textContent).toContain('Actions');
    expect(completedRounds()).toEqual([1]);
    expect(fingerprint(storedSchedule().rounds[0])).toBe(before);
  });

  it('leaves the afternoon alone when Done changes nothing', () => {
    mount();
    generate();
    markComplete(1);
    const before = storedSchedule().rounds.map(fingerprint);

    parkOnSetup();
    openPlanner();
    clickButton(/^Done$/);

    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
  });

  it('leaves a round already played as it was played', () => {
    mount();
    generate();
    markComplete(1);
    const before = storedSchedule().rounds.map(fingerprint);

    parkOnSetup();
    openPlanner();
    // Round 1 is locked, so there is nothing to press on it. Setting a round
    // still to come and putting it straight back is the same no-op.
    setRoundType(3, 'Mixed Round');
    setRoundType(3, 'Normal Round');
    clickButton(/^Done$/);

    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
  });

  it('sits the format on a tab above the card, with the icon for that format', () => {
    mount();
    clickButton(/^Continue to Setup/);
    planRound(2, 'Mixed Round');
    clickButton(/^Generate Schedule/);

    const card = roundCard(2);
    // Outside the card, and immediately above it. Inside, it was one more thing
    // on the heading line; here the card's own top edge closes the tab.
    expect(text(card)).not.toContain('Mixed Round');
    const tab = [...roundBlock(2).children].find((el) => text(el).includes('Mixed Round'))!;
    expect(tab).toBeDefined();
    expect(tab.nextElementSibling).toBe(card);
    expect(tab.className).toContain('justify-center');

    const badge = tab.firstElementChild!;
    // The same drawing the Round Types panel marks the format with, and an edge
    // in the fill's own colour several steps down.
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(badge.className).toContain('bg-teal-100');
    expect(badge.className).toContain('border-teal-400');
  });

  it('marks a gendered round with both symbols, since the format is two things', () => {
    mount();
    clickButton(/^Continue to Setup/);
    planRound(2, 'Gendered Round');
    clickButton(/^Generate Schedule/);

    const tab = [...roundBlock(2).children].find((el) => text(el).includes('Gendered Round'))!;
    expect(tab.firstElementChild!.querySelectorAll('svg')).toHaveLength(2);
  });

  it('lets the host give every round the same type, one tap at a time', () => {
    mount();
    clickButton(/^Continue to Setup/);
    openPlanner();
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) setRoundType(n, 'Mixed Round');
    clickButton(/^Done$/);
    clickButton(/^Generate Schedule/);

    expect(storedSchedule().rounds.map((r) => r.roundType)).toEqual(Array(8).fill('mixed'));
  });

  // 12 players, six of each gender, on 3 courts. Four men fill one court and
  // four women another; the two men and two women left over cannot make a
  // gendered court, so they play an ordinary game on court 3. The printout says
  // so, or the round looks like it went wrong. The screen does not: its header
  // row already carries the court's name, the scoreboard and the balance badge,
  // and on a phone the board sat on top of the mark.
  describe('a court the format cannot fill', () => {
    beforeEach(() => seed(12, 12, 3));

    function printedRound(n: number): string {
      const cards = [...container.querySelectorAll('.print-only .round-card')];
      const card = cards.find((c) => text(c.querySelector('h2') ?? c).startsWith(`ROUND ${n}`));
      if (!card) throw new Error(`no printed card for ROUND ${n}`);
      return text(card);
    }

    it('marks the leftover court on paper and leaves the screen alone', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Gendered Round');
      clickButton(/^Generate Schedule/);

      const gendered = storedSchedule().rounds[1];
      expect(gendered.roundType).toBe('gendered');
      expect(gendered.courts).toHaveLength(3);
      expect(gendered.courts.filter((c) => genderCount(c) === 1)).toHaveLength(2);

      // The sheet has the width for it and no scoreboard to put it under.
      expect(printedRound(2).match(/\(normal game\)/g)).toHaveLength(1);
      // The court panel does not, so nothing is written on it. The card above
      // it carries the explanation instead.
      expect(text(roundCard(2))).not.toContain('Normal game');
    });

    it('says on the card why the leftover court is not a gendered game', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Gendered Round');
      clickButton(/^Generate Schedule/);

      // Six men and six women on three courts: one men's court, one women's,
      // and two of each left over.
      const gendered = storedSchedule().rounds[1];
      expect(gendered.courts.filter((c) => genderCount(c) > 1)).toHaveLength(1);

      // Shut: the one line saying what could not be done, and no arithmetic.
      expect(text(roundCard(2))).toContain('Unable to make last game gendered');
      expect(text(roundCard(2))).not.toContain('A gendered game needs');
      // One of them, under the one court that missed, not under every court.
      expect(text(roundCard(2)).match(/Unable to make/g)).toHaveLength(1);

      const toggle = [...roundCard(2).querySelectorAll('button')].find((b) =>
        text(b).startsWith('Unable to make')
      );
      if (!toggle) throw new Error('no miss note on the card');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      // And under the court rather than over it: the names first, the note
      // second, and nothing after it.
      const note = toggle.parentElement!;
      expect(text(note.previousElementSibling!)).toContain('COURT');
      expect(note.nextElementSibling).toBeNull();

      click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(text(roundCard(2))).toContain(
        'A gendered game needs four men or four women. The 2 men and 2 women left over cannot make one.'
      );

      // And it folds away again.
      click(toggle);
      expect(text(roundCard(2))).not.toContain('A gendered game needs');
    });

    it('says nothing about a court that is not the last one on the card', () => {
      // Ten men and two women: court 1 is the mixed one the format could make,
      // and both of the others missed. Only the bottom one is the last game.
      seed(12, 12, 3);
      window.localStorage.setItem(
        'pb-roster',
        JSON.stringify(
          NAMES.map((name, i) => ({
            id: `p${i + 1}`,
            name,
            rating: 3.5,
            gender: i < 2 ? 'F' : 'M',
            rosterIds: ['g1'],
          }))
        )
      );
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Mixed Round');
      clickButton(/^Generate Schedule/);

      const headlines = [...roundCard(2).querySelectorAll('button')]
        .map((b) => text(b))
        .filter((t) => t.startsWith('Unable to make'));
      expect(headlines).toEqual([
        'Unable to make this game mixed',
        'Unable to make last game mixed',
      ]);
    });

    it('says nothing on a round where every court is in format', () => {
      mount();
      clickButton(/^Continue to Setup/);
      // Six of each gender fills all three mixed courts.
      planRound(2, 'Mixed Round');
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[1].roundType).toBe('mixed');
      expect(text(roundCard(2))).not.toContain('A mixed game needs');
    });

    it('says nothing on an ordinary round, which is not trying to be a format', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Gendered Round');
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[0].roundType).toBeUndefined();
      expect(text(roundCard(1))).not.toContain('A gendered game needs');
    });

    it('says nothing on paper either when every court is in format', () => {
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Mixed Round');
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[1].roundType).toBe('mixed');
      expect(printedRound(2)).not.toContain('normal game');
    });

    it('marks who is on a court, and leaves the bench alone', () => {
      // The mark answers one question: are the four on this court the four the
      // format asked for. Nobody sitting out is on a court, so a mark there
      // answers nothing and only crowds a row that has no room to spare.
      seed(9, 9, 2); // eight playing, one waiting
      mount();
      clickButton(/^Continue to Setup/);
      planRound(2, 'Gendered Round');
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[1].roundType).toBe('gendered');
      const benched = storedSchedule().rounds[1].sitOuts;
      expect(benched).toHaveLength(1);

      const marked = (name: string) =>
        [...roundCard(2).querySelectorAll('span[title]')].some((s) =>
          (s.getAttribute('title') ?? '').startsWith(`${name} is a `)
        );

      // Everybody on a court carries one; the one on the bench does not.
      for (const p of storedSchedule().rounds[1].courts.flatMap((c) => [...c.team1, ...c.team2])) {
        expect(marked(p.name), `${p.name} is playing`).toBe(true);
      }
      expect(marked(benched[0].name), `${benched[0].name} is sitting out`).toBe(false);
    });
  });
});

describe('the step tabs', () => {
  beforeEach(() => seed(9, 9, 2));

  /** A step tab, found in the nav rather than among the page's own buttons. */
  function tab(label: RegExp): HTMLButtonElement {
    const found = [...container.querySelectorAll('nav button')].find((b) => label.test(text(b)));
    if (!found) throw new Error(`no step tab matching ${label}`);
    return found as HTMLButtonElement;
  }

  const playersTab = () => tab(/^1\. Players$/);
  const setupTab = () => tab(/^2\. Setup$/);
  const scheduleTab = () => tab(/^3\. Schedule$/);

  const scoringOn = () =>
    JSON.parse(window.localStorage.getItem('pb-scoring-enabled') ?? 'false');

  /**
   * To Setup, and through the question it always asks once there is a schedule.
   *
   * There is no way to walk onto that page and keep the afternoon, which is the
   * point of it: Setup is where a schedule is built, so arriving is leaving.
   */
  function toSetup() {
    click(setupTab());
    if (/Abandon This Schedule\?/.test(container.textContent ?? '')) {
      clickButton(/^Return to Setup/);
    }
  }

  /**
   * A real schedule with no record of what it was built from.
   *
   * That is what a session parked by a build older than the basis looks like,
   * and with Setup ending sessions and the Players tab rebuilding rather than
   * breaking, it is the one thing left that can put a live schedule behind a
   * tab drawn shut. Relaunched onto Players, because the effect that writes the
   * basis runs on the Schedule tab and would put it straight back.
   */
  function forgetBasis() {
    remount(() => {
      window.localStorage.removeItem('pb-schedule-basis');
      window.localStorage.setItem('pb-step', JSON.stringify('roster'));
    });
  }

  it('opens a tab only once the host has been through that step', () => {
    mount();
    expect(playersTab().getAttribute('aria-current')).toBe('step');
    expect(setupTab().disabled).toBe(true);
    expect(scheduleTab().disabled).toBe(true);

    clickButton(/^Continue to Setup/);
    expect(setupTab().getAttribute('aria-current')).toBe('step');
    expect(playersTab().disabled).toBe(false);
    // Never a door, from the first visit to Setup onwards: flat, and pressable
    // only so it can say where the schedule comes from.
    expect(scheduleTab().style.backgroundColor).toBe('');
    expect(scheduleTab().disabled).toBe(false);

    // Back to Players by the tab, and Setup is still a way forward from there.
    click(playersTab());
    expect(container.textContent).toContain('Continue to Setup');
    expect(setupTab().disabled).toBe(false);
    click(setupTab());
    expect(container.textContent).toContain('Generate Schedule');

    clickButton(/^Generate Schedule/);
    expect(playersTab().disabled).toBe(false);
    expect(setupTab().disabled).toBe(false);
    // The tab you are standing on is never a door either.
    expect(scheduleTab().disabled).toBe(true);
  });

  it('keeps the schedule while the host looks at Players, and takes them back', () => {
    // The whole of it. A host running three of tomorrow's groups steps over to
    // Players to add somebody to next week's list, not to end this afternoon,
    // and the tab they pressed to leave is the tab that brings them back.
    mount();
    generate();
    const before = storedSchedule().rounds.map(fingerprint);

    click(playersTab());
    expect(container.textContent).toContain('Continue to Setup');
    expect(storedSchedule()).not.toBeNull();

    click(scheduleTab());
    expect(container.textContent).toContain('Actions');
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
  });

  it('asks on the way to Setup with nothing to lose, and never on the way to Players', () => {
    mount();
    generate();

    click(playersTab());
    expect(container.textContent).not.toContain('Abandon This Schedule?');

    // Nothing scored, nothing edited, and it asks anyway. "Sessions stay live
    // until the host goes to Setup" is only sayable if it has no exceptions.
    click(setupTab());
    expect(container.textContent).toContain('Abandon This Schedule?');

    // And no is no: the schedule stands and the host has not moved.
    clickButton(/^Cancel$/);
    expect(storedSchedule()).not.toBeNull();
    expect(container.textContent).toContain('Continue to Setup');
  });

  it('lets Keep Score be changed mid-session, from the Actions sheet', () => {
    // Keeping score is a setting about the session, not an input to the
    // pairings, so it was never a reason to build anything. It only lived on
    // Setup, which cost nothing to visit and now ends the afternoon — so a host
    // who starts a session and then wants the boards on would have had to
    // rebuild. The switch is on the sheet for that reason, and only that one.
    mount();
    generate();
    const before = storedSchedule().rounds.map(fingerprint);
    expect(scoringOn()).toBe(false);

    clickButton(/^Actions$/);
    clickLabel('Keep Score?', sheet());

    expect(scoringOn()).toBe(true);
    // Still the same afternoon, still on it, nothing asked.
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
    expect(container.textContent).not.toContain('Abandon This Schedule?');
  });

  /**
   * The heart of it. The Schedule tab is a raised card whenever there is a
   * schedule to go back to, and drawn flat when there is not — and flat, it
   * still answers, because somebody pressing it is asking where theirs went.
   */
  it('is a door from Players while the schedule still stands', () => {
    mount();
    generate();

    click(playersTab());
    // A card like the other two, rather than the flat tab it used to be.
    expect(scheduleTab().style.backgroundColor).not.toBe('');
    expect(scheduleTab().disabled).toBe(false);

    click(scheduleTab());
    expect(container.textContent).toContain('Actions');
  });

  it('is flat on Setup, because arriving on Setup is what ended the session', () => {
    mount();
    generate();

    toSetup();
    expect(storedSchedule()).toBeNull();
    expect(scheduleTab().style.backgroundColor).toBe('');
    // But never marked disabled: it does something, and saying otherwise would
    // be a lie told only to the people relying on the markup.
    expect(scheduleTab().disabled).toBe(false);
    expect(scheduleTab().getAttribute('aria-disabled')).toBeNull();

    // Drawn shut, pressed anyway: the box appears rather than nothing at all.
    click(scheduleTab());
    expect(container.textContent).toContain('Tap Generate Schedule');
    expect(container.textContent).toContain('Generate Schedule');
  });

  it('sends them to Setup for the button when there is nothing to go back to', () => {
    mount();
    generate();
    forgetBasis();

    expect(container.textContent).toContain('Continue to Setup');
    expect(storedSchedule()).not.toBeNull();
    expect(scheduleTab().style.backgroundColor).toBe('');

    click(scheduleTab());
    expect(container.textContent).toContain('Tap Generate Schedule');
    expect(container.textContent).toContain('Generate Schedule');
  });

  it('hands the same schedule back when the change is undone', () => {
    // A comparison rather than a one-way flag, so changing your mind is free:
    // put the rounds back and Generate returns what was parked rather than
    // building another.
    //
    // Relaunched onto Setup rather than walked there, because walking there
    // ends the session and leaves nothing to hand back. What is left standing
    // on that page with a schedule under it is a host who closed the app on it,
    // and it is why handleGeneratePress still has this branch.
    mount();
    generate();
    const before = storedSchedule().rounds.map(fingerprint);

    parkOnSetup();
    clickLabel('More rounds');
    clickLabel('Fewer rounds');

    clickButton(/^Generate Schedule/);
    expect(container.textContent).toContain('Actions');
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
  });

  it('puts the box down again once Generate has been pressed', () => {
    mount();
    generate();
    forgetBasis();

    click(scheduleTab());
    expect(container.textContent).toContain('Tap Generate Schedule');

    clickButton(/^Generate Schedule/);
    expect(container.textContent).not.toContain('Tap Generate Schedule');
    expect(container.textContent).toContain('Actions');
  });

  it('leaves New Round Robin asking, even with nothing to lose', () => {
    mount();
    generate();

    action(/^New Round Robin$/);
    expect(text(sheet())).toContain('New Round Robin?');
    expect(text(sheet())).toContain(
      'This will discard the current schedule including any scores you\u2019ve entered.'
    );
    expect(text(sheet())).toContain(
      'The same set of players will be selected again; however, you can change them.'
    );
  });

  describe('and what the Players tab does to the schedule', () => {
    /**
     * Back onto the schedule the way a host does it: the tab.
     *
     * It used to be Setup and then the button, because that was the only
     * entrance. That it is one press now is the point of the change, and it is
     * also what makes each of these tests honest — the schedule they check is
     * the one that was standing, not one Generate happened to build again.
     */
    function backToSchedule() {
      click(scheduleTab());
    }

    /**
     * The same nine, in two groups rather than one.
     *
     * Everything about being taken out of a group needs a second one to still
     * be in. Unticking the only group somebody belongs to is the orphan path,
     * which offers to delete them and is a different question entirely.
     */
    function seedTwoGroups() {
      seed(9, 8, 2);
      const players = JSON.parse(window.localStorage.getItem('pb-roster')!) as unknown[];
      window.localStorage.setItem(
        'pb-rosters',
        JSON.stringify([{ id: 'g1', name: 'Test Group' }, { id: 'g2', name: 'Other Group' }])
      );
      window.localStorage.setItem(
        'pb-roster',
        JSON.stringify(players.map((p) => ({ ...(p as object), rosterIds: ['g1', 'g2'] })))
      );
    }

    /** A group's tick box inside the open Edit Player panel. */
    function clickGroupBox(name: string) {
      const panel = container.querySelector('.fixed.inset-0');
      if (!panel) throw new Error('no panel open');
      const box = [...panel.querySelectorAll('label')].find((l) => text(l) === name);
      if (!box) throw new Error(`no group box for ${name}`);
      click(box.querySelector('input[type="checkbox"]')!);
    }

    /** Manage, the group's pencil, Delete, and the panel's own confirm. */
    function deleteGroup(name: string) {
      clickButton(/^Manage$/);
      click(labelled(`Edit ${name}`));
      clickButton(/^Delete$/);
      clickButton(/^Delete Group$/);
    }

    /** The pencil on a row, then the panel's own Update. */
    function editPlayer(name: string, change: () => void) {
      click(labelled(`Edit ${name}`));
      change();
      clickButton(/^Update$/);
    }

    function labelled(label: string): HTMLElement {
      const el = container.querySelector(`[aria-label="${label}"]`);
      if (!el) throw new Error(`no control labelled ${label}`);
      return el as HTMLElement;
    }

    function typeInto(input: HTMLInputElement, value: string) {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    /** Names in one stored round, on a court or on the bench. */
    function namesInRound(n: number): string[] {
      const round = storedSchedule().rounds.find((r) => r.roundNumber === n);
      if (!round) throw new Error(`no round ${n} in the stored schedule`);
      return [
        ...round.courts.flatMap((c) => [...c.team1, ...c.team2].map((p) => p.name)),
        ...round.sitOuts.map((p) => p.name),
      ];
    }

    /** Every name the schedule in storage has, across every round. */
    function namesInSchedule(): string[] {
      return storedSchedule().rounds.flatMap((r) => namesInRound(r.roundNumber));
    }

    /**
     * A button inside the open Edit Player panel, not one on the page behind it.
     *
     * The Add Player card at the top of Players has its own M and F, and it
     * comes first in the document. Both gender tests below were pressing that
     * one and proving nothing at all.
     */
    function panelButton(re: RegExp) {
      const panel = container.querySelector('.fixed.inset-0');
      if (!panel) throw new Error('no panel open');
      clickButton(re, panel);
    }

    /** The text box inside the open Edit Player panel, not the one on the page. */
    function panelNameBox(): HTMLInputElement {
      const panel = container.querySelector('.fixed.inset-0');
      if (!panel) throw new Error('no panel open');
      return panel.querySelector('input[type="text"]') as HTMLInputElement;
    }

    it('keeps the schedule when somebody is renamed, and writes the new name onto the courts', () => {
      // The rename used to be saved against the player and left stale in the
      // schedule, which was invisible only because nobody could get back to the
      // schedule to see it.
      mount();
      generate();
      const before = storedSchedule().rounds.map(fingerprint);

      click(playersTab());
      editPlayer('Ava', () => typeInto(panelNameBox(), 'Ava Renamed'));

      expect(namesInSchedule()).toContain('Ava Renamed');
      expect(namesInSchedule()).not.toContain('Ava');

      backToSchedule();
      expect(container.textContent).toContain('Ava Renamed');
      // The same rounds, under the new name: a rename is not a rebuild.
      expect(storedSchedule().rounds.map(fingerprint)).toEqual(
        before.map((f) => f.replace(/\bAva\b/g, 'Ava Renamed'))
      );
    });

    it('keeps the schedule when a gender is corrected and no round was built around gender', () => {
      mount();
      generate();
      const before = storedSchedule().rounds.map(fingerprint);

      click(playersTab());
      editPlayer('Ava', () => panelButton(/^F$/));
      expect(storedPlayer('Ava').gender).toBe('F');

      backToSchedule();
      expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
    });

    it('rebuilds around a deleted player rather than throwing the schedule away', () => {
      // The same deal the Actions sheet's Remove Player offers, reached from the
      // tab where somebody dropping out for good is actually noticed.
      mount();
      generate();
      markComplete(1);

      // Walked there, which is the change: with a round ticked this used to ask
      // and answering was what ended the session. What is being held here is
      // the rebuild, which is unchanged.
      click(playersTab());
      click(labelled('Edit Ava'));
      clickButton(/^Delete$/);
      clickButton(/^Yes, Delete$/);

      backToSchedule();
      // The round already played is untouched, Ava and all: it is what happened.
      expect(completedRounds()).toEqual([1]);
      expect(namesInRound(1)).toContain('Ava');
      // Every round still to come has been rebuilt without her.
      expect(namesInRound(2)).not.toContain('Ava');
      expect(namesInRound(8)).not.toContain('Ava');
    });

    it('rebuilds around somebody taken out of the group, rather than breaking', () => {
      // The mirror image of the delete above, and it used to get none of its
      // care: unticking the open group dropped a playing player out of the
      // session, moved the basis, and said nothing. The schedule was left
      // describing an afternoon that could no longer happen.
      seedTwoGroups();
      mount();
      generate();
      markComplete(1);

      click(playersTab());
      editPlayer('Ava', () => clickGroupBox('Test Group'));

      // Nothing asked, and the tab is still a door.
      expect(container.textContent).not.toContain('Abandon This Schedule?');
      backToSchedule();
      expect(completedRounds()).toEqual([1]);
      expect(namesInRound(1)).toContain('Ava');
      expect(namesInRound(2)).not.toContain('Ava');
      expect(namesInRound(8)).not.toContain('Ava');
    });

    it('carries a rename into the rounds already played when the same edit drops them', () => {
      // Both at once, which the panel makes easy: it sends name, rating and
      // gender on every Update whether or not they moved. The rebuild has to
      // start from the schedule the rename left behind, or the correction is
      // written and then written straight back over.
      seedTwoGroups();
      mount();
      generate();
      markComplete(1);

      click(playersTab());
      editPlayer('Ava', () => {
        typeInto(panelNameBox(), 'Ava Renamed');
        clickGroupBox('Test Group');
      });

      backToSchedule();
      // The round already played is what happened, under the corrected name.
      expect(namesInRound(1)).toContain('Ava Renamed');
      expect(namesInRound(1)).not.toContain('Ava');
      // And she is in none of the rounds still to come, under either name.
      expect(namesInRound(2)).not.toContain('Ava Renamed');
      expect(namesInRound(2)).not.toContain('Ava');
    });

    it('keeps the way back open when a gender is corrected on a Gendered round', () => {
      // Gender is in the basis, but only on a schedule built around it. Left
      // alone this would shut the tab behind a host standing on Players, whose
      // only way back would then be Setup, which costs them the afternoon.
      seed(9, 8, 2);
      // Sixteen slots, which is what PLAN_SLOTS is and what the store holds.
      // An ordinary round is null rather than a word.
      window.localStorage.setItem(
        'pb-round-plan',
        JSON.stringify(['gendered', ...Array<null>(15).fill(null)])
      );
      mount();
      generate();
      expect(storedSchedule().rounds[0].roundType).toBe('gendered');

      click(playersTab());
      expect(storedPlayer('Ava').gender).toBe('M');
      editPlayer('Ava', () => panelButton(/^F$/));
      expect(storedPlayer('Ava').gender).toBe('F');

      // Still a door, and the round is still what it was built as: a court that
      // no longer fits picks up its "(normal game)" note rather than moving
      // four people because one of them was typed in wrong.
      expect(scheduleTab().style.backgroundColor).not.toBe('');
      backToSchedule();
      expect(storedSchedule().rounds[0].roundType).toBe('gendered');
    });

    it('asks before deleting the group the session is running in', () => {
      seedTwoGroups();
      mount();
      generate();
      markComplete(1);

      click(playersTab());
      deleteGroup('Test Group');
      expect(container.textContent).toContain('Abandon This Schedule?');
      expect(container.textContent).toContain('ends the session running in it');

      // No is no: the group is still there and so is the afternoon.
      clickButton(/^Cancel$/);
      expect(completedRounds()).toEqual([1]);
      expect(storedSchedule()).not.toBeNull();
      expect(container.textContent).toContain('Test Group');
    });

    it('says nothing about deleting a group the session is not in', () => {
      seedTwoGroups();
      mount();
      generate();
      markComplete(1);

      click(playersTab());
      deleteGroup('Other Group');

      expect(container.textContent).not.toContain('Abandon This Schedule?');
      backToSchedule();
      expect(completedRounds()).toEqual([1]);
    });

    it('keeps the schedule when the player deleted was not in it', () => {
      // Nine in the group, eight of them playing. The ninth leaving the group
      // has nothing to do with the afternoon.
      seed(9, 8, 2);
      mount();
      generate();
      markComplete(1);

      parkOnPlayers();
      click(labelled('Edit Ivy'));
      clickButton(/^Delete$/);
      clickButton(/^Yes, Delete$/);

      backToSchedule();
      expect(completedRounds()).toEqual([1]);
    });

    it('adds a player to the group without touching the schedule', () => {
      mount();
      generate();

      click(playersTab());
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      typeInto(input, 'Newcomer');
      clickButton(/^Add Player$/);

      // They are in the group, not in the session, and the session is untouched.
      expect(namesInSchedule()).not.toContain('Newcomer');
    });
  });

  /**
   * The one question left about losing a schedule, asked at the one door out of
   * one: the tab, on the way off an afternoon the host has worked on.
   */
  describe('abandoning a schedule', () => {
    const dialog = () => container.querySelector('.fixed.inset-0');

    it('asks, names the tab being taken, and says what a yes costs', () => {
      mount();
      generate();
      markComplete(1);

      click(setupTab());

      const heading = dialog()!.querySelector('h2');
      expect(text(heading!)).toBe('Abandon This Schedule?');
      // The size every other panel in the app heads itself with.
      expect(heading!.className).toContain('text-[1.35rem]');
      expect(heading!.className).toContain('font-extrabold');
      expect(text(dialog()!)).toContain(
        'Returning to Setup discards the session including any entered scores.'
      );
      // The destination is the one word set apart, because it is the one thing
      // this dialog is about.
      const bold = [...dialog()!.querySelectorAll('strong')].map(text);
      expect(bold).toContain('Setup');
      expect(buttons(/^Return to Setup$/, dialog()!)).toHaveLength(1);
      expect(buttons(/^Cancel$/, dialog()!)).toHaveLength(1);
    });

    it('promises the link will survive when the group has one out', () => {
      // Decision made with Jeff: a link belongs to the group rather than to one
      // afternoon, so tidying up the setup on the morning of does not ask
      // fourteen people to scan a new QR code. The dialog has to say so, or the
      // host will not believe it and will not press the button.
      seed(9, 8, 2);
      window.localStorage.setItem('pb-share-key', JSON.stringify('ABCDEFGHJK'));
      mount();
      generate();

      click(setupTab());
      expect(text(container)).toContain(
        'Your link stays the same and will show the new schedule.'
      );
    });

    it('says nothing about a link when the group has none', () => {
      mount();
      generate();

      click(setupTab());
      expect(text(container)).not.toContain('Your link stays the same');
    });

    it('says nothing at all on the way to Players', () => {
      // Players used to be the other door out of an afternoon and is not one
      // now. A host with a round played and a score on the board can step over
      // to add somebody to next week's list and come straight back.
      mount();
      generate();
      markComplete(1);

      click(playersTab());
      expect(container.textContent).not.toContain('Abandon This Schedule?');
      expect(storedSchedule()).not.toBeNull();
      expect(completedRounds()).toEqual([1]);
      expect(container.textContent).toContain('Continue to Setup');
    });

    it('changes nothing at all on Cancel', () => {
      seed(9, 9, 2, true);
      mount();
      generate();
      markComplete(1);
      scoreFirstCourt('11', '7');
      const before = storedSchedule().rounds.map(fingerprint);

      click(setupTab());
      clickButton(/^Cancel$/);

      // Still on the schedule, with the afternoon exactly as it was.
      expect(container.textContent).toContain('Actions');
      expect(completedRounds()).toEqual([1]);
      expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
    });

    it('clears the session on a yes, and keeps the crowd', () => {
      mount();
      generate();
      markComplete(1);
      const ticked = JSON.parse(window.localStorage.getItem('pb-selected-ids')!);

      click(setupTab());
      clickButton(/^Return to Setup$/);

      expect(container.textContent).toContain('Generate Schedule');
      expect(storedSchedule()).toBeNull();
      expect(completedRounds()).toEqual([]);
      expect(JSON.parse(window.localStorage.getItem('pb-session-id') ?? 'null')).toBeNull();
      expect(JSON.parse(window.localStorage.getItem('pb-schedule-basis') ?? 'null')).toBeNull();
      // The same people are still ticked: the next Generate is one press away.
      expect(JSON.parse(window.localStorage.getItem('pb-selected-ids')!)).toEqual(ticked);
    });

    /**
     * The question no longer depends on what the host has done.
     *
     * It used to: scores, completed rounds and padlocks were the three kinds of
     * work worth asking about, and anything else was parked in silence. Setup
     * ends a session whatever state it is in, so what is worth pinning now is
     * that none of these move it — including taking the padlock back off, which
     * used to be the way to make the question go away.
     */
    it('asks the same whatever has been done to it', () => {
      mount();
      generate();

      const lock = container.querySelector('[aria-label^="Lock "]');
      expect(lock, 'no padlock on the first court').toBeTruthy();
      click(lock!);
      click(setupTab());
      expect(container.textContent).toContain('Abandon This Schedule?');
      clickButton(/^Cancel$/);

      click(container.querySelector('[aria-label^="Unlock "]')!);
      click(setupTab());
      expect(container.textContent).toContain('Abandon This Schedule?');
      clickButton(/^Cancel$/);

      action(/^Add Round$/);
      clickButton(/^Add 1 Round$/, sheet());
      click(setupTab());
      expect(container.textContent).toContain('Abandon This Schedule?');
      clickButton(/^Cancel$/);

      reshuffle();
      click(setupTab());
      expect(container.textContent).toContain('Abandon This Schedule?');
    });
  });

  /**
   * Both doors out of a schedule say what it costs, and they do not say it in
   * the same words.
   *
   * The tab is walking away from an afternoon, so what somebody would miss is
   * the scores. New Round Robin clears the afternoon and starts another, so it
   * says what happens to the players as well. Pinned as a pair so an edit to
   * one cannot quietly leave the other promising something it does not do.
   */
  it('says what each door costs, in its own words', () => {
    mount();
    generate();
    markComplete(1);

    click(setupTab());
    expect(text(container)).toContain(
      'Returning to Setup discards the session including any entered scores.'
    );
    clickButton(/^Cancel$/);

    action(/^New Round Robin$/);
    expect(text(sheet())).toContain(
      'This will discard the current schedule including any scores you\u2019ve entered.'
    );
  });

  // The tabs are now the only way back, so nothing else would notice a stray
  // back button reappearing on either page.
  it('leaves no back button on Setup or on the schedule', () => {
    mount();
    clickButton(/^Continue to Setup/);
    expect(container.textContent).not.toContain('← Players');

    clickButton(/^Generate Schedule/);
    expect(container.textContent).not.toContain('← Setup');
  });
});

describe('Share App', () => {
  beforeEach(() => seed(6, 4, 1));

  /** The Share overlay, found by its heading rather than by position. */
  function sharePanel(): HTMLElement {
    const found = [...container.querySelectorAll('.fixed.inset-0')].find((d) =>
      text(d).includes('Share the App')
    );
    if (!found) throw new Error('Share panel not open');
    return found as HTMLElement;
  }

  function openShare() {
    click(container.querySelector('[aria-label="Open settings"]')!);
    clickButton(/^Share App$/);
  }

  // The panel used to be a fallback: the sheet was tried first and this only
  // appeared where there was none, which is almost no one. It now opens first.
  it('opens the panel rather than going straight to the OS share sheet', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'share', {
      value: share,
      configurable: true,
    });

    mount();
    openShare();

    expect(sharePanel()).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
  });

  it('shows the app address, the copy line and the footer', () => {
    mount();
    openShare();

    const body = text(sharePanel());
    expect(body).toContain(APP_URL);
    expect(body).toContain("Then share it anywhere you'd like");
    expect(body).toContain('Thanks for being part of the pickleball community!');
    expect(sharePanel().querySelector('img[src="/share-top.png"]')).toBeTruthy();
  });

  it('offers the OS sheet when the browser has one, and hands it the payload', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'share', {
      value: share,
      configurable: true,
    });

    mount();
    openShare();
    clickButton(/^Share/, sharePanel());

    expect(share).toHaveBeenCalledWith(sharePayload());
  });

  // A button that cannot do anything is worse than no button.
  it('leaves the Share button out where there is no share sheet', () => {
    Object.defineProperty(window.navigator, 'share', {
      value: undefined,
      configurable: true,
    });

    mount();
    openShare();

    const panel = sharePanel();
    expect(buttons(/^Copy Link/, panel)).toHaveLength(1);
    expect(buttons(/^Share…|^Share\.\.\./, panel)).toHaveLength(0);
  });

  it('closes on Close', () => {
    mount();
    openShare();
    clickButton(/^Close$/, sharePanel());
    expect(container.textContent).not.toContain('Share the App');
  });
});

/**
 * A roster that will not divide by four.
 *
 * Eleven people who have all turned up used to be told the app needed twelve for
 * three courts, and the host had to drop a court or send somebody home. Now the
 * last court plays a 2v1 and the schedule comes out. The refusal only survives
 * where a court would hold one person on their own.
 */
describe('a roster short of a full set of courts', () => {
  it('11 players over 3 courts plays a 2v1 on the last one', () => {
    seed(11, 11, 3);
    mount();
    generate();

    const s = storedSchedule();
    for (const round of s.rounds) {
      expect(round.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 3]);
      expect(round.sitOuts).toHaveLength(0);
    }
    // The missing fourth place, named on the schedule the host is reading.
    expect(container.textContent).toContain('EMPTY');
  });

  it('10 players over 3 courts plays singles on the last one', () => {
    seed(10, 10, 3);
    mount();
    generate();

    const s = storedSchedule();
    for (const round of s.rounds) {
      expect(round.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 2]);
    }
    // Both spare places are drawn, so two latecomers can be tapped straight in.
    expect(container.textContent).toContain('EMPTY');
  });

  it('9 players over 3 courts is still refused, and says what it wants', () => {
    // The tenth court place would be one person alone, which is not a game.
    seed(9, 9, 3);
    mount();
    clickButton(/^Continue to Setup/);
    clickButton(/^Generate Schedule/);

    expect(container.textContent).toContain('Need at least 10 players for 3 courts (have 9)');
    expect(storedSchedule()).toBeNull();
  });

  /**
   * It used to ask for four first, and change its mind to fourteen the moment
   * four were ticked. The app sent somebody to do a job and moved the
   * goalposts on them.
   */
  it('asks for the real number from the start, with nobody ticked', () => {
    seed(20, 0, 4);
    mount();
    clickButton(/^Continue to Setup/);
    clickButton(/^Generate Schedule/);

    expect(container.textContent).toContain('Need at least 14 players for 4 courts (have 0)');
    expect(container.textContent).not.toContain('Select at least 4 players');

    // And it says the same thing after four, only with the count moved on. The
    // grid has no labels of its own: a row is a <label> around a checkbox.
    const tick = (name: string) => {
      const row = [...container.querySelectorAll('label')].find((l) => text(l).startsWith(name));
      if (!row) throw new Error(`no row for ${name}`);
      click(row.querySelector('input')!);
    };
    for (const name of ['Ava', 'Ben', 'Cara', 'Dan']) tick(name);

    clickButton(/^Generate Schedule/);
    expect(container.textContent).toContain('Need at least 14 players for 4 courts (have 4)');
  });

  /**
   * Full width it read as the main thing on the panel, which the two numbers
   * above it are.
   */
  it('keeps the Set Round Types title to its own words, at the left', () => {
    seed(9, 9, 2);
    mount();
    clickButton(/^Continue to Setup/);

    const button = buttons(/^Set Round Types$/)[0];
    expect(button.className).not.toContain('w-full');
    // Nothing inside it stretches to fill a row either.
    expect(button.querySelector('span')!.className).not.toContain('flex-1');
  });

  it('counts one court as one court', () => {
    // Six in the group so Setup can be reached at all, two of them ticked.
    seed(6, 2, 1);
    mount();
    clickButton(/^Continue to Setup/);
    clickButton(/^Generate Schedule/);

    expect(container.textContent).toContain('Need at least 4 players for 1 court (have 2)');
    expect(container.textContent).not.toContain('1 courts');
  });
});

/**
 * Putting somebody into an empty place.
 *
 * An empty place is a slot like any other: tap it, then tap whoever should stand
 * in it. Off the bench they simply join and the place is gone — a place on a
 * court is not a person, so nothing goes back to Sitting out in exchange. Off
 * another court the two places change hands.
 *
 * A tap only ever changes the round it was made in. The one case where doing it
 * round by round would be busywork, a single gap and a single latecomer, never
 * reaches a tap: adding the player fills it everywhere on its own.
 */
describe('filling an empty place', () => {
  /** The EMPTY button in a round, or null. */
  function emptyIn(n: number): HTMLElement | null {
    return (buttons(/^EMPTY$/, roundCard(n))[0] as HTMLElement) ?? null;
  }

  /** Everybody in a round, on a court or on the bench. */
  const everyone = (n: number) =>
    [...onCourt(storedSchedule().rounds[n - 1]), ...storedSchedule().rounds[n - 1].sitOuts
      .map((p) => p.name)];

  /**
   * Adds the first candidate the sheet offers, and names them. Read off the
   * schedule rather than the row, whose label runs the name and rating together.
   */
  function addPlayer(): string {
    const before = new Set(everyone(1));
    action(/^Add Player$/);
    const rows = buttons(/\d\.\d$/, sheet());
    expect(rows.length).toBeGreaterThan(0);
    click(rows[0]);

    const added = everyone(1).filter((name) => !before.has(name));
    expect(added).toHaveLength(1);
    return added[0];
  }

  /**
   * Two places going spare and somebody on the bench: 10 over 3 courts is 4, 4
   * and a game of singles, and an eleventh has nowhere obvious to stand.
   */
  function benchedLatecomer(): string {
    seed(12, 10, 3);
    mount();
    generate();
    addPlayer();

    const benched = storedSchedule().rounds[0].sitOuts;
    expect(benched).toHaveLength(1);
    return benched[0].name;
  }

  it('walks a latecomer straight onto a court with one place spare', () => {
    // 11 over 3 courts is 4, 4, 3. There is one gap and only one player to put
    // in it, so asking the host to tap it in eight times would be busywork.
    seed(12, 11, 3);
    mount();
    generate();
    const latecomer = addPlayer();

    for (const round of storedSchedule().rounds) {
      expect(onCourt(round)).toContain(latecomer);
      expect(round.sitOuts).toEqual([]);
      expect(round.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 4]);
    }
    expect(emptyIn(1)).toBeNull();
  });

  it('benches a latecomer when there is more than one place to choose between', () => {
    const latecomer = benchedLatecomer();

    for (const round of storedSchedule().rounds) {
      expect(round.sitOuts.map((p) => p.name)).toContain(latecomer);
      // The singles court is left alone. Who partners whom is the host's call.
      expect(round.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 2]);
    }
  });

  it('benches the next one too, rather than pairing them off unasked', () => {
    benchedLatecomer();
    addPlayer();

    const round = storedSchedule().rounds[0];
    expect(round.sitOuts).toHaveLength(2);
    expect(round.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 2]);
  });

  it('takes somebody off the bench, and the place is simply gone', () => {
    const latecomer = benchedLatecomer();

    click(emptyIn(1)!);
    clickButton(new RegExp(`^${latecomer}`), roundCard(1));

    const round = storedSchedule().rounds[0];
    expect(round.courts.map((c) => c.team1.length + c.team2.length)).toEqual([4, 4, 3]);
    expect(round.sitOuts).toEqual([]); // not swapped out for anybody
  });

  it('puts them in that round and no other', () => {
    // The host picked a side on this round. That says nothing about who should
    // partner whom in the next one, so it is not carried anywhere.
    const latecomer = benchedLatecomer();

    click(emptyIn(1)!);
    clickButton(new RegExp(`^${latecomer}`), roundCard(1));

    const [first, ...rest] = storedSchedule().rounds;
    expect(onCourt(first)).toContain(latecomer);
    for (const round of rest) {
      expect(round.sitOuts.map((p) => p.name)).toContain(latecomer);
      expect(onCourt(round)).not.toContain(latecomer);
    }
  });

  it('leaves rounds already played alone', () => {
    const latecomer = benchedLatecomer();
    markComplete(2);

    const played = fingerprint(storedSchedule().rounds[1]);
    click(emptyIn(1)!);
    clickButton(new RegExp(`^${latecomer}`), roundCard(1));

    expect(fingerprint(storedSchedule().rounds[1])).toBe(played);
  });

  it('swaps the place with a player from a full court', () => {
    seed(11, 11, 3);
    mount();
    generate();

    const before = storedSchedule().rounds[0];
    const mover = before.courts[0].team1[0];

    click(emptyIn(1)!);
    clickButton(new RegExp(`^${mover.name}`), roundCard(1));

    const after = storedSchedule().rounds[0];
    // The player moved to the short court, and the gap went back the other way.
    expect(onCourt(after)).toContain(mover.name);
    expect(after.courts[2].team1.concat(after.courts[2].team2).map((p) => p.name))
      .toContain(mover.name);
    expect(after.courts.map((c) => c.team1.length + c.team2.length)).toEqual([3, 4, 4]);
    expect(after.sitOuts).toEqual([]);
  });

  it('lets a 2v1 be rearranged, so the host picks who plays alone', () => {
    seed(11, 11, 3);
    mount();
    generate();

    const before = storedSchedule().rounds[0];
    const wasAlone = before.courts[2].team2[0].name;
    const moving = before.courts[2].team1[0].name;

    // The spare place is on the single's side. Tapping it, then one of the pair,
    // sends that player across and leaves their partner on their own.
    click(emptyIn(1)!);
    clickButton(new RegExp(`^${moving}`), roundCard(1));

    const court = storedSchedule().rounds[0].courts[2];
    expect(court.team1.length + court.team2.length).toBe(3); // still three-handed
    expect(court.team2.map((p) => p.name).sort()).toEqual([moving, wasAlone].sort());
    expect(court.team1).toHaveLength(1); // whoever is left is now the one alone
    expect(court.team1[0].name).not.toBe(moving);
  });

  it('will not take the second player off a game of singles', () => {
    // 10 over 3 courts is 4, 4 and a singles game. Moving one of those two into
    // the spare place beside the other would leave a side with nobody on it.
    seed(10, 10, 3);
    mount();
    generate();

    const before = fingerprint(storedSchedule().rounds[0]);
    const receiving = storedSchedule().rounds[0].courts[2].team2[0].name;

    click(buttons(/^EMPTY$/, roundCard(1))[0]); // the spare place beside team 1
    clickButton(new RegExp(`^${receiving}`), roundCard(1)); // the player on team 2

    expect(fingerprint(storedSchedule().rounds[0])).toBe(before);
  });

  it('will not let one short court rob another', () => {
    // Two short courts is only reachable by hand: fill one spare place on the
    // singles court from a full court and both ends up three-handed. Neither can
    // then give a player to the other without stranding somebody.
    seed(10, 10, 3);
    mount();
    generate();

    const donor = storedSchedule().rounds[0].courts[0].team1[0].name;
    click(buttons(/^EMPTY$/, roundCard(1))[0]);
    clickButton(new RegExp(`^${donor}`), roundCard(1));

    const mid = storedSchedule().rounds[0];
    expect(mid.courts.map((c) => c.team1.length + c.team2.length)).toEqual([3, 4, 3]);

    // Now court 1 is short too. Its spare place cannot be filled from court 3.
    const before = fingerprint(mid);
    const victim = mid.courts[2].team1[0].name;
    click(buttons(/^EMPTY$/, roundCard(1))[0]); // court 1's spare place
    clickButton(new RegExp(`^${victim}`), roundCard(1));

    expect(fingerprint(storedSchedule().rounds[0])).toBe(before);
  });

  it('is not offered on a round already played', () => {
    seed(11, 11, 3);
    mount();
    generate();
    markComplete(1);

    // The card is frozen, so the place stays visible but does nothing.
    const before = fingerprint(storedSchedule().rounds[0]);
    const empty = emptyIn(1);
    if (empty) click(empty);
    expect(fingerprint(storedSchedule().rounds[0])).toBe(before);
  });
});

/**
 * The Actions sheet, which replaced the Reshuffle and New Session buttons.
 *
 * Reshuffle and New Round Robin are covered above, through the same sheet.
 * These are the seven things the schedule could not do before it existed.
 */
describe('the Actions sheet', () => {
  /** Fills a text input the way a person does, so React sees the change. */
  function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  const nameBox = () => sheet().querySelector('input[type="text"]') as HTMLInputElement;

  it('offers the nine actions, in the order they were asked for', () => {
    // Edit Player Rating is deliberately not among them. The pencil on a place
    // edits the rating along with the name and the gender, so a card that did
    // one of the three was a second road to the same place.
    seed(9, 9, 2);
    mount();
    generate();

    clickButton(/^Actions$/);
    expect(text(sheet())).toContain('Quick changes for this session');
    expect(buttons(/./, sheet()).map(text)).toEqual([
      'Add Player', 'Remove Player', 'Add Guest',
      'New Round Robin', 'Reshuffle', 'Share Session',
      'Add Round', 'Add Court', 'Remove Court',
    ]);
  });

  /**
   * Every action's own panel opens the same way: the glyph off its card, large
   * and on the centre line, then the title under it, then the line under that.
   * The grid behind them keeps its own left-aligned heading and has no glyph of
   * its own — it is nine of them.
   */
  it('heads each action panel with its own glyph, centred, above the title', () => {
    // Spare players in the group, so Sub Player and Add Guest are live
    // cards rather than disabled ones that swallow the tap.
    seed(12, 8, 2);
    mount();
    generate();

    clickButton(/^Actions$/);
    const header = () => sheet().querySelector('header')!;
    expect(header().querySelector('svg.h-14')).toBeNull();

    for (const label of ['Add Player', 'Remove Player', 'Add Guest', 'Reshuffle']) {
      clickButton(new RegExp(`^${label}$`), sheet());
      const stack = header().querySelector('h2')!.parentElement!;
      expect(text(stack), label).toContain(label);
      expect(stack.className, label).toContain('items-center');
      expect(stack.className, label).toContain('text-center');
      // The glyph is the first thing in the stack, and the title follows it.
      expect(stack.firstElementChild!.querySelector('svg'), `${label} has no glyph`)
        .toBeTruthy();
      expect(stack.children[1].tagName).toBe('H2');
      clickLabel('Back to Actions', sheet());
    }
  });

  it('counts the same rounds in the question and on the button, and lists what survives', () => {
    // The panel says a number twice: once asking and once on the button that
    // does it. They come from one count, and a panel that asked about 5 and
    // rebuilt 6 would be the one mistake nobody would forgive.
    seed(9, 9, 2);
    mount();
    generate();
    const open = storedSchedule().rounds.length;

    action(/^Reshuffle$/);
    const panel = () => text(sheet());
    expect(panel()).toContain(`Rebuild ${open} Remaining Rounds?`);
    expect(buttons(new RegExp(`^Rebuild ${open} Rounds$`), sheet())).toHaveLength(1);

    // The three promises, each with a glyph of its own. The warning is not one
    // of them: nothing has been scored here, so it has nothing to warn about
    // and is covered on its own below.
    for (const line of [
      'Sit outs are still fairly calculated',
      'Locked pairs stay together',
      'Linked partners stay together',
    ]) {
      expect(panel(), line).toContain(line);
    }
    expect(sheet().querySelectorAll('ul li svg').length).toBe(3);

    // Cancel goes back to the grid without touching the schedule.
    const before = storedSchedule().rounds.map(fingerprint);
    clickButton(/^Cancel$/, sheet());
    expect(text(sheet())).toContain('Quick changes for this session');
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
  });

  it('counts down the rounds it offers to rebuild as they are played', () => {
    // Marking a round complete takes it out of the rebuild, so both the
    // question and the button have to drop by one. A fixed string would have
    // gone on offering to rebuild the whole afternoon.
    seed(9, 9, 2);
    mount();
    generate();
    const all = storedSchedule().rounds.length;

    markComplete(1);
    action(/^Reshuffle$/);
    expect(text(sheet())).toContain(`Rebuild ${all - 1} Remaining Rounds?`);
    expect(buttons(new RegExp(`^Rebuild ${all - 1} Rounds$`), sheet())).toHaveLength(1);
    clickButton(/^Cancel$/, sheet());
    clickLabel('Close Actions', sheet());

    // Down to the last one, where both lines have to lose the plural.
    for (let n = 2; n < all; n++) markComplete(n);
    action(/^Reshuffle$/);
    expect(text(sheet())).toContain('Rebuild 1 Remaining Round?');
    expect(buttons(/^Rebuild 1 Round$/, sheet())).toHaveLength(1);
  });

  it('asks before it reshuffles, and the card on its own changes nothing', () => {
    // Reshuffle throws away every round not yet played, and the card used to do
    // that the moment it was touched. A misplaced thumb halfway through an
    // afternoon rebuilt the rest of it with nothing to press and no way back.
    // That it then does the work is covered by every test using reshuffle().
    seed(9, 9, 2);
    mount();
    generate();
    const before = storedSchedule().rounds.map(fingerprint);

    action(/^Reshuffle$/);
    expect(text(sheet())).toMatch(/Rebuild \d+ Remaining Rounds\?/);
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);

    clickButton(REBUILD, sheet());
    expect(text(sheet())).toContain('reshuffled.');
  });

  /**
   * The orange half of the Reshuffle panel, which is now conditional.
   *
   * It is the only irreversible thing the panel does, so it has to appear
   * whenever it is true. The failure worth guarding is the other way round: an
   * orange box on every rebuild, most of them with no score anywhere near them,
   * teaches a host to read past the colour by the afternoon it matters.
   */
  describe('the warning about losing scores', () => {
    const WARNING = 'Scores in incomplete rounds will be deleted';


    it('stays away when nothing has been scored, even with scoring switched on', () => {
      seed(9, 9, 2, true);
      mount();
      generate();

      action(/^Reshuffle$/);
      // What survives is still said. Only the half with nothing to say is gone.
      expect(text(sheet())).toContain('Locked pairs stay together');
      expect(text(sheet())).not.toContain(WARNING);
      expect(text(sheet())).not.toContain('Scores in completed rounds are safe.');
    });

    it('appears the moment a score sits in a round the rebuild would throw away', () => {
      seed(9, 9, 2, true);
      mount();
      generate();
      scoreFirstCourt('11', '7');

      action(/^Reshuffle$/);
      expect(text(sheet())).toContain(WARNING);
    });

    it('goes again once that round is marked complete, because it is then safe', () => {
      // The real test of the rule. There is still a score in the session, but a
      // completed round is not rebuilt, so there is nothing left to lose and
      // saying otherwise would be a lie in orange.
      seed(9, 9, 2, true);
      mount();
      generate();
      scoreFirstCourt('11', '7');
      markComplete(1);

      action(/^Reshuffle$/);
      expect(text(sheet())).not.toContain(WARNING);
    });
  });

  it('offers sharing with no database, and says why it cannot be done', () => {
    // The suite runs with the Supabase variables blanked, which is a build made
    // without them. The card used to be hidden here. It is not any more: a host
    // who has never signed in has no way of learning that sharing exists if the
    // thing that would explain it is the thing being hidden. What it must not
    // do is offer an account this build could not make.
    seed(9, 9, 2);
    mount();
    generate();

    action(/^Share Session$/);
    expect(text(sheet())).toContain('Accounts are switched off');
    expect(buttons(/^Create an Account/, sheet())).toHaveLength(0);
  });

  it('offers an account to a signed-out host, and comes back to the card', async () => {
    // The whole point of the card being there. Tapping through lands in My
    // Account, and closing it returns to the thing they were trying to do
    // rather than to the schedule with the sheet gone.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test');
    try {
      seed(9, 9, 2);
      mount();
      generate();

      action(/^Share Session$/);
      expect(text(sheet())).toContain('Sharing a session needs an account');

      clickButton(/^Create an Account/, sheet());
      // Waited out, so the sheet is really gone rather than mid-slide. Without
      // this the assertion at the end could be reading the old one.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, SHEET_GONE_MS));
      });
      expect(() => sheet()).toThrow();

      // The sheet has let its lock go, and My Account still holds one. This
      // is the moment that tells counted locks from naive ones: a lock that
      // does not count its holders unfreezes the page right here, under an
      // overlay that asked for it still.
      expect(scroller().style.overflow).toBe('hidden');

      // The panel has to load the Supabase client before it can say whether
      // anyone is signed in, so this is its opening state rather than the sign
      // in form. What matters here is that it opened, and how it closes.
      const hero = container.querySelector('img[src="/account-top.png"]');
      expect(hero).not.toBeNull();
      click(hero!.closest('div')!.parentElement!);

      expect(text(sheet())).toContain('Sharing a session needs an account');

      // And the page moves again afterwards. This route holds two scroll locks
      // at once — the sheet is still sliding out when My Account opens — and
      // releases them in the order it took them, which before the locks were
      // counted left the page frozen on every tab with nothing left to let it
      // go. The freeze is an overflow on the app's scroll pane now, so that is
      // what must be clear again.
      click(container.querySelector('[aria-label="Close Actions"]')!);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, SHEET_GONE_MS));
      });
      expect(scroller().style.overflow).toBe('');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  /**
   * How a panel answers its own question: a row of tiles under the content,
   * each one a glyph over a label, in the tint that says what it costs.
   *
   * The buttons used to be pinned to the foot of the sheet, which put the
   * answer a screen below the question. They sit under the content now. The
   * sheet is still opened to the same height for every action.
   */
  describe('the tiles a panel is answered with', () => {
    const FULL = () => `${Math.round(window.innerHeight * 0.92)}px`;

    beforeEach(() => {
      seed(12, 8, 2);
      mount();
      generate();
    });

    /**
     * One sheet, whatever is on it. A panel sized to its own content is a
     * different sheet every time it opens, and the tiles answering the question
     * land somewhere new on each of them.
     */
    it('opens every panel to the same height, whatever is on it', () => {
      clickButton(/^Actions$/);
      for (const card of [
        'Add Player',
        'Add Guest',
        'New Round Robin',
        'Reshuffle',
        'Add Round',
        'Add Court',
        'Remove Court',
      ]) {
        clickButton(new RegExp(`^${card}$`), sheet());
        expect(sheet().style.height, card).toBe(FULL());
        clickLabel('Back to Actions', sheet());
      }

      // Remove Player is two panels behind one card: the list of who is going
      // home, then the panel confirming it. Both are the same sheet.
      clickButton(/^Remove Player$/, sheet());
      expect(sheet().style.height, 'Remove Player').toBe(FULL());
      clickButton(/^\w/, sheet());
      expect(sheet().style.height, 'Remove Player, confirming').toBe(FULL());
    });

    it('gives every answer a glyph, so none of them is a bare word', () => {
      clickButton(/^Actions$/);
      for (const [card, labels] of [
        ['Add Round', [/^Cancel$/, /^Add 1 Round$/]],
        ['Add Court', [/^Cancel$/, /^Add the Court$/]],
        ['New Round Robin', [/^Cancel$/, /^Yes, Start New$/]],
        // Counts the rounds it is about to rebuild, so it is matched by shape.
        ['Reshuffle', [/^Cancel$/, /^Rebuild \d+ Rounds?$/]],
      ] as const) {
        clickButton(new RegExp(`^${card}$`), sheet());
        const tiles = labels.map((l) => buttons(l, sheet())[0]);
        for (const [i, tile] of tiles.entries()) {
          expect(tile, `${card} / ${labels[i]}`).toBeTruthy();
          expect(tile.querySelector('svg'), `${card} / ${labels[i]} has no glyph`).toBeTruthy();
          expect(tile.querySelector('.font-bold'), `${card} / ${labels[i]} is not bold`)
            .toBeTruthy();
        }
        clickLabel('Back to Actions', sheet());
      }
    });

    /**
     * Orange is what the Reshuffle panel warns in: the box above these tiles is
     * what a rebuild costs. The button that does it cannot wear the colour of
     * the warning against doing it.
     */
    it('draws Rebuild in teal, not in the colour of the warning above it', () => {
      action(/^Reshuffle$/);
      const rebuild = buttons(/^Rebuild/, sheet())[0];
      expect(rebuild.className).toContain('brand-teal');
      expect(rebuild.className).not.toContain('orange');
    });

    /** Red, and pale with it, exactly as Stop Sharing is on the live link card. */
    it('draws the answer that takes something away in the same red throughout', () => {
      action(/^New Round Robin$/);
      const start = buttons(/^Yes, Start New$/, sheet())[0];
      clickLabel('Back to Actions', sheet());
      clickButton(/^Remove Player$/, sheet());
      clickButton(/^\w/, sheet());
      const remove = buttons(/^Remove$/, sheet())[0];

      expect(remove.className).toBe(start.className);
      // Not a solid fill. The tint is the whole point: these sit beside a
      // Cancel, and a red slab next to a white one is a dare.
      expect(start.className).not.toContain('bg-red-600');
    });

    it('leads New Round Robin with what it costs, in bold', () => {
      action(/^New Round Robin$/);
      const cost = [...sheet().querySelectorAll('p')].find((p) =>
        text(p).startsWith('This will discard')
      );
      expect(cost, 'no line saying what it costs').toBeTruthy();
      expect(cost!.className).toContain('font-bold');
      expect(text(sheet())).toContain(
        'The same set of players will be selected again; however, you can change them.'
      );
    });
  });

  describe('Add Court', () => {
    // Twelve over two courts is eight playing and four waiting. A third court
    // is exactly enough for the four of them.
    beforeEach(() => seed(12, 12, 2));

    it('adds it to the unplayed rounds and takes the bench off the bench', () => {
      mount();
      generate();
      markComplete(1);
      const played = fingerprint(storedSchedule().rounds[0]);

      action(/^Add Court$/);
      expect(text(sheet())).toContain('The 4 players sitting out will be placed on it');
      clickButton(/^Add the Court$/, sheet());

      const after = storedSchedule();
      expect(fingerprint(after.rounds[0])).toBe(played);
      expect(courtsOf(after.rounds[0])).toEqual([1, 2]);

      for (const r of after.rounds.slice(1)) {
        expect(courtsOf(r), `Round ${r.roundNumber}`).toEqual([1, 2, 3]);
        expect(onCourt(r)).toHaveLength(12);
        expect(r.sitOuts).toEqual([]);
      }
    });

    it('moves numCourts with it, so a reshuffle keeps the court', () => {
      mount();
      generate();

      action(/^Add Court$/);
      clickButton(/^Add the Court$/, sheet());
      expect(window.localStorage.getItem('pb-num-courts')).toBe('3');

      reshuffle();
      for (const r of storedSchedule().rounds) {
        expect(courtsOf(r), `Round ${r.roundNumber}`).toHaveLength(3);
      }
    });

    it('says so when the roster cannot fill the court it is being given', () => {
      seed(9, 9, 2);
      mount();
      generate();

      // Nine players fill two courts and a 2v1. A third has nobody for it.
      action(/^Add Court$/);
      expect(text(sheet())).toContain('a reshuffle would drop it again');
    });

    /**
     * This panel went without a Cancel while every other one had one. The back
     * chevron in the corner is not a way of declining — nothing says it is —
     * and this is the panel that changes the shape of every remaining round.
     */
    it('can be declined, and declining it adds nothing', () => {
      mount();
      generate();
      const before = storedSchedule();

      action(/^Add Court$/);
      clickButton(/^Cancel$/, sheet());

      // Back on the grid, with the nine cards on it and no court added.
      expect(buttons(/./, sheet()).map(text)).toContain('Add Court');
      expect(storedSchedule()).toEqual(before);
      expect(window.localStorage.getItem('pb-num-courts')).toBe('2');
    });
  });

  describe('Remove Court', () => {
    beforeEach(() => seed(12, 12, 3));

    it('takes it out of the unplayed rounds and sits its players down', () => {
      mount();
      generate();
      markComplete(1);
      const played = fingerprint(storedSchedule().rounds[0]);
      const losing = storedSchedule().rounds[1].courts[1];
      const displaced = [...losing.team1, ...losing.team2].map((p) => p.name);

      action(/^Remove Court$/);
      clickButton(/^COURT 2/, sheet());

      const after = storedSchedule();
      expect(fingerprint(after.rounds[0])).toBe(played);
      expect(courtsOf(after.rounds[0])).toEqual([1, 2, 3]);

      for (const r of after.rounds.slice(1)) {
        expect(courtsOf(r), `Round ${r.roundNumber}`).toEqual([1, 3]);
      }
      expect(after.rounds[1].sitOuts.map((p) => p.name).sort()).toEqual([...displaced].sort());
      expect(window.localStorage.getItem('pb-num-courts')).toBe('2');
    });

    it('names who would be sitting out before it is tapped', () => {
      mount();
      generate();
      const on = storedSchedule().rounds[0].courts[0];
      const first = [...on.team1, ...on.team2][0].name;

      action(/^Remove Court$/);
      expect(text(sheet())).toContain(first);
      expect(text(sheet())).toContain('sit out instead');
    });
  });

  describe('Add Round', () => {
    beforeEach(() => seed(9, 9, 2));

    it('puts it on the end without touching the ones above', () => {
      mount();
      generate();
      const before = storedSchedule().rounds.map(fingerprint);

      action(/^Add Round$/);
      // Future tense: nothing has happened until the button below is pressed.
      expect(text(sheet())).toContain('Round 9 will be added');
      expect(text(sheet())).not.toContain('are added');
      const line = [...sheet().querySelectorAll('p')].find((el) =>
        text(el).startsWith('Round 9')
      )!;
      expect(line.className).toContain('text-center');

      clickButton(/^Add 1 Round$/, sheet());

      const after = storedSchedule();
      expect(after.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(after.rounds.slice(0, 8).map(fingerprint)).toEqual(before);
      expect(window.localStorage.getItem('pb-num-rounds')).toBe('9');
      expect(onCourt(after.rounds[8])).toHaveLength(8);
    });

    /**
     * One round a time, on purpose. The stepper that offered up to eight went
     * with the frequency machine: a host adding rounds is adding the next one,
     * and each one now carries a format of its own to choose.
     */
    it('offers no way to add more than one', () => {
      mount();
      generate();
      action(/^Add Round$/);

      expect(text(sheet())).not.toContain('Add 2 Rounds');
      expect(sheet().querySelector('[aria-label="More rounds"]')).toBeNull();
      expect(sheet().querySelector('[aria-label="Fewer rounds"]')).toBeNull();
    });

    it('offers the four round types, Normal first', () => {
      mount();
      generate();
      action(/^Add Round$/);

      const pills = [...sheet().querySelectorAll('button')]
        .map((b) => text(b))
        .filter((t) => ['Normal', 'Gendered', 'Mixed', 'Equal Skill'].includes(t));
      expect(pills).toEqual(['Normal', 'Gendered', 'Mixed', 'Equal Skill']);
    });

    it('builds the new round as the type that was picked', () => {
      mount();
      generate();
      action(/^Add Round$/);
      clickButton(/^Gendered$/, sheet());
      clickButton(/^Add 1 Round$/, sheet());

      const added = storedSchedule().rounds[8];
      expect(added.roundType).toBe('gendered');
      // And the planner agrees, so the round has a row saying what it is.
      expect(JSON.parse(window.localStorage.getItem('pb-round-plan')!)[8]).toBe('gendered');
    });

    it('adds an ordinary round when nothing is picked', () => {
      mount();
      generate();
      action(/^Add Round$/);
      clickButton(/^Add 1 Round$/, sheet());

      expect(storedSchedule().rounds[8].roundType).toBeUndefined();
      expect(JSON.parse(window.localStorage.getItem('pb-round-plan')!)[8]).toBeNull();
    });

    it('adds nothing on Cancel', () => {
      mount();
      generate();
      action(/^Add Round$/);
      clickButton(/^Mixed$/, sheet());
      clickButton(/^Cancel$/, sheet());

      expect(storedSchedule().rounds).toHaveLength(8);
      // Back on the menu, not shut.
      expect(text(sheet())).toContain('Add Round');
    });

    it('is still offered once every round has been played', () => {
      mount();
      generate();
      for (let n = 1; n <= 8; n++) markComplete(n);

      action(/^Add Round$/);
      clickButton(/^Add 1 Round$/, sheet());
      expect(storedSchedule().rounds).toHaveLength(9);
      expect(completedRounds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe('Sub Player', () => {
    // Twelve in the group, eleven playing: Lex is the one left to come on.
    beforeEach(() => seed(12, 11, 2));

    it('takes the place of the player going off, in every unplayed round', () => {
      mount();
      generate();
      markComplete(1);

      const going = storedSchedule().rounds[1].courts[0].team1[0].name;
      const expected = storedSchedule().rounds.map((r) =>
        fingerprint(r).replace(going, 'Lex')
      );
      const playedAs = fingerprint(storedSchedule().rounds[0]);

      subIn(going, 2);
      expect(text(sheet())).toContain(`Who is going on for ${going}?`);
      clickButton(/^Lex/, sheet());

      const after = storedSchedule();
      // The round already played keeps the player who played it.
      expect(fingerprint(after.rounds[0])).toBe(playedAs);
      // Every other round is the same games with one name changed.
      expect(after.rounds.slice(1).map(fingerprint)).toEqual(expected.slice(1));
    });

    it('leaves the Completed checkboxes usable, unlike a removal', () => {
      mount();
      generate();
      markComplete(1);

      const going = storedSchedule().rounds[1].courts[0].team1[0].name;
      subIn(going, 2);
      clickButton(/^Lex/, sheet());

      expect(window.localStorage.getItem('pb-removed-ids')).toBe('[]');
      expect(checkbox(1).disabled).toBe(false);
    });

    it('offers the player who came off back again', () => {
      mount();
      generate();

      const going = storedSchedule().rounds[0].courts[0].team1[0].name;
      subIn(going, 1);
      clickButton(/^Lex/, sheet());

      clickButton(/^Actions$/);
      clickButton(/^Add Player$/, sheet());
      expect(text(sheet())).toContain(going);
    });

    /**
     * Somebody nobody has ever entered turning up to take a place.
     *
     * The list of people who could come on is the group minus whoever is
     * already playing, and until now a newcomer was not on it — the answer was
     * to back out, add them, and start the substitution again. Add Player has
     * had a way out of that list for a long time; this is the same one.
     */
    it('lets somebody brand new take the place, in one move', () => {
      mount();
      generate();
      markComplete(1);

      const going = storedSchedule().rounds[1].courts[0].team1[0].name;
      const expected = storedSchedule().rounds.map((r) =>
        fingerprint(r).replace(going, 'Robin')
      );
      const playedAs = fingerprint(storedSchedule().rounds[0]);

      subIn(going, 2);
      clickButton(/^Someone New$/, sheet());

      // The form says what it is about to do, which is not what it says when
      // it is reached from Add Player.
      expect(text(sheet())).toContain(`Add and Sub In for ${going}`);
      const name = sheet().querySelector('input[type="text"]') as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 'value'
        )!.set!;
        setter.call(name, 'Robin');
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });
      clickButton(new RegExp(`^Add and Sub In for ${going}$`), sheet());

      const after = storedSchedule();
      // The round already played is untouched, including the player who left.
      expect(fingerprint(after.rounds[0])).toBe(playedAs);
      // And every round still to come is the same games with the new name in
      // that one place — not a fifth player added on top of a full court.
      expect(after.rounds.slice(1).map(fingerprint)).toEqual(expected.slice(1));
      // They joined the group too, so next week they are on the list.
      expect(storedPlayers().map((p) => p.name)).toContain('Robin');
    });
  });

  /**
   * The card that took Sub Player's place on the grid.
   *
   * The two are not the same job and the panel says so: a substitution keeps
   * the rounds as they were and puts somebody else in one seat, and this
   * rebuilds every round still to play around one fewer person. That is why
   * only this one locks the Completed checkboxes.
   */
  describe('Remove Player', () => {
    beforeEach(() => seed(9, 9, 2));

    it('wears the same red as the other card that takes something away', () => {
      mount();
      generate();
      clickButton(/^Actions$/);

      const glyph = (label: string) =>
        (buttons(new RegExp(`^${label}$`), sheet())[0].querySelector('span') as HTMLElement)
          .style.color;

      expect(glyph('Remove Player')).toBe(glyph('Remove Court'));
      expect(glyph('Remove Player')).not.toBe(glyph('Add Player'));
    });

    it('takes the one tapped out of the rounds still to play', () => {
      mount();
      generate();
      markComplete(1);

      const going = storedSchedule().rounds[1].courts[0].team1[0];
      const playedAs = fingerprint(storedSchedule().rounds[0]);

      action(/^Remove Player$/);
      expect(text(sheet())).toContain('Who is going home?');
      clickButton(new RegExp(`^${going.name}`), sheet());
      clickButton(/^Remove$/, sheet());

      // The round already played keeps whoever played it.
      expect(fingerprint(storedSchedule().rounds[0])).toBe(playedAs);
      // And they are in none of the rest, on a court or on the bench.
      for (const round of storedSchedule().rounds.slice(1)) {
        const present = [
          ...round.courts.flatMap((c) => [...c.team1, ...c.team2]),
          ...round.sitOuts,
        ];
        expect(present.map((p) => p.id)).not.toContain(going.id);
      }
      expect(window.localStorage.getItem('pb-removed-ids')).toContain(going.id);
    });

    it('locks the Completed checkboxes, which a sub does not', () => {
      mount();
      generate();
      markComplete(1);

      const going = storedSchedule().rounds[1].courts[0].team1[0].name;
      action(/^Remove Player$/);
      clickButton(new RegExp(`^${going}`), sheet());
      clickButton(/^Remove$/, sheet());

      // The rounds behind those boxes were rebuilt around the removal, so
      // unticking one would offer to replay a round that no longer exists.
      expect(checkbox(1).disabled).toBe(true);
    });

    it('says so when it costs a court', () => {
      // Six on two courts is one full court and one short one of two. Take a
      // player out and the short court has nobody left to be short with, so
      // there is one court and one person on the bench.
      //
      // Not eight on two: seven still fills a four and a three, and a short
      // court counts as a court. There is nothing to warn about there, which
      // is the case this warning has to stay quiet for.
      seed(6, 6, 2);
      mount();
      generate();

      action(/^Remove Player$/);
      clickButton(new RegExp(`^${storedSchedule().rounds[0].courts[0].team1[0].name}`), sheet());
      expect(text(sheet())).toContain('This drops to 1 court');
      expect(text(sheet())).toContain('1 player sits out each round');
    });

    it('stays quiet when the courts survive it', () => {
      seed(9, 9, 2);
      mount();
      generate();

      action(/^Remove Player$/);
      clickButton(new RegExp(`^${storedSchedule().rounds[0].courts[0].team1[0].name}`), sheet());
      expect(text(sheet())).not.toContain('This drops to');
    });

    it('is not offered at all when it would leave fewer than four', () => {
      seed(4, 4, 1);
      mount();
      generate();

      clickButton(/^Actions$/);
      const card = buttons(/^Remove Player$/, sheet())[0] as HTMLButtonElement;
      expect(card.disabled).toBe(true);
      expect(card.title).toContain('fewer than 4');
    });
  });

  describe('Add Guest', () => {
    beforeEach(() => seed(9, 9, 2));

    it('plays this session without ever joining the group', () => {
      mount();
      generate();

      action(/^Add Guest$/);
      typeInto(nameBox(), 'Sam');
      clickButton(/^Add Guest$/, sheet());

      // Never in the pool, which is the half of storage that syncs.
      expect(storedPlayers().map((p) => p.name)).not.toContain('Sam');
      expect(storedGuests().map((g) => g.name)).toEqual(['Sam']);
      expect(storedGuests()[0].guest).toBe(true);

      for (const r of storedSchedule().rounds) {
        const everyone = [...onCourt(r), ...r.sitOuts.map((p) => p.name)];
        expect(everyone, `Round ${r.roundNumber}`).toContain('Sam');
      }
      // No badge on them, on any round. A guest plays like anybody else on the
      // sheet, which is what the printed version always did.
      const cards = [...container.querySelectorAll('.round-card')];
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.textContent).not.toContain('Guest');
      }
    });

    it('names the field for who is being added', () => {
      mount();
      generate();

      action(/^Add Guest$/);

      // The panel borrows Add Player's form, and calling the box Player Name
      // on it asks for the one thing a guest is not.
      const labels = [...sheet().querySelectorAll('label')].map((el) => text(el));
      expect(labels).toContain('Guest Name');
      expect(labels).not.toContain('Player Name');
    });

    it('goes when the session goes', () => {
      mount();
      generate();

      action(/^Add Guest$/);
      typeInto(nameBox(), 'Sam');
      clickButton(/^Add Guest$/, sheet());
      expect(storedGuests()).toHaveLength(1);

      action(/^New Round Robin$/);
      clickButton(/^Yes, Start New$/, sheet());
      expect(storedGuests()).toEqual([]);
    });
  });

  describe('Add Player', () => {
    beforeEach(() => seed(9, 9, 2));

    it('takes somebody nobody has met into the group and the session', () => {
      mount();
      generate();

      clickButton(/^Actions$/);
      clickButton(/^Add Player$/, sheet());
      clickButton(/^Someone New$/, sheet());
      typeInto(nameBox(), 'Nia');
      clickButton(/^Add to Group and Session$/, sheet());

      // The group keeps her, unlike a guest.
      expect(storedPlayers().map((p) => p.name)).toContain('Nia');
      expect(storedGuests()).toEqual([]);
      for (const r of storedSchedule().rounds) {
        const everyone = [...onCourt(r), ...r.sitOuts.map((p) => p.name)];
        expect(everyone, `Round ${r.roundNumber}`).toContain('Nia');
      }
    });

    /**
     * The two lists of people, and what is said over them.
     *
     * Both are "find this person and tap them" rather than anything to read in
     * order, and the roster's own order is the order people were typed in years
     * ago. The rest is about what a tap on a full session actually does: the
     * new arrival lands under Sitting Out, at the foot of a schedule the host
     * is not looking at, and nothing said so.
     */
    describe('the list, and the warning over it', () => {
      /**
       * Names in the order a roster really grows, which is none. The suite's
       * own NAMES are alphabetical already, so seeding with those would let an
       * unsorted list pass.
       */
      const SCRAMBLED = [
        'Nina', 'Cara', 'Zane', 'Beth', 'Yuri', 'Dana', 'Wren', 'Otto',
        'Abe', 'Milo', 'Kit', 'Gil'
      ];
      /**
       * Eight playing over two courts, which is two full games and nobody
       * waiting. Not six over two: that builds a 4 and a 1v1, and a singles
       * court has seats going spare, so the courts are not full.
       */
      const PLAYING = ['Beth', 'Cara', 'Dana', 'Nina', 'Otto', 'Wren', 'Yuri', 'Zane'];
      const ADDABLE = ['Abe', 'Gil', 'Kit', 'Milo'];

      beforeEach(() => {
        seed(12, 8, 2);
        const roster = JSON.parse(window.localStorage.getItem('pb-roster')!) as {
          name: string;
        }[];
        roster.forEach((p, i) => (p.name = SCRAMBLED[i]));
        window.localStorage.setItem('pb-roster', JSON.stringify(roster));
      });

      /** The names down a list of rows, in the order they are drawn. */
      function listed(): string[] {
        return [...sheet().querySelectorAll('span.flex-1')].map((s) =>
          (s.textContent ?? '').trim()
        );
      }

      it('sorts the group alphabetically, so a name can be looked up', () => {
        mount();
        generate();
        action(/^Add Player$/);

        expect(listed()).toEqual(ADDABLE);
      });

      it('sorts who is playing the same way, on Remove Player', () => {
        mount();
        generate();
        action(/^Remove Player$/);

        expect(listed()).toEqual(PLAYING);
      });

      it('offers Someone New above the names rather than under them', () => {
        mount();
        generate();
        action(/^Add Player$/);

        const order = [...sheet().querySelectorAll('button')].map((b) => text(b));
        const newcomer = order.findIndex((t) => /^Someone New$/.test(t));
        const firstName = order.findIndex((t) => t.startsWith(ADDABLE[0]));
        expect(newcomer, 'no Someone New button').toBeGreaterThan(-1);
        // On a full group the list runs past the foot of the sheet, and the way
        // to add somebody who is not on it was below the fold.
        expect(newcomer).toBeLessThan(firstName);
      });

      it('says a full session benches whoever is added, before they are', () => {
        mount();
        generate();
        action(/^Add Player$/);

        const said = text(sheet());
        expect(said).toContain('All courts are full.');
        expect(said).toContain('New players will be added to the Sitting Out section.');
        expect(said).toContain('to rebuild the remaining rounds.');
      });

      it('says it in yellow, which is not what the app warns in', () => {
        mount();
        generate();
        action(/^Add Player$/);

        // The box itself, not the sheet around it or the pair of lines inside
        // it: the one that draws the rounded edge everything else is set in.
        const notice = [...sheet().querySelectorAll('div')].find(
          (d) => text(d).startsWith('All courts are full.') && d.className.includes('rounded-lg')
        )!;
        expect(notice, 'no box around the full-courts line').toBeTruthy();
        // Nothing is lost by adding somebody to a full session, so this is a
        // note and not a warning. Orange and the triangle stay with the panels
        // that really do take something away.
        expect(notice.className).toContain('bg-notice-yellow');
        expect(notice.className).toContain('border-2');
        expect(notice.className).not.toContain('bg-brand-orange-light');
      });

      it('draws the Reshuffle shape beside the word, not the word alone', () => {
        mount();
        generate();
        action(/^Add Player$/);

        const marked = [...sheet().querySelectorAll('span')].find(
          (s) => text(s) === 'Reshuffle' && s.querySelector('svg')
        );
        // The way out of a full session is a card on the menu behind this one,
        // and the shape is what connects the sentence to it.
        expect(marked, 'Reshuffle is named with no glyph on it').toBeTruthy();
      });

      /**
       * An added court stays empty until the host taps people onto it, so the
       * courts are not full and the sentence would be a lie. They were told
       * what an empty court means on the panel that made it.
       */
      it('says nothing of the sort when a court has seats going spare', () => {
        mount();
        generate();
        action(/^Add Court$/);
        clickButton(/^Add the Court$/, sheet());

        action(/^Add Player$/);
        expect(text(sheet())).not.toContain('All courts are full');
      });
    });
  });
});

/**
 * Keeping score, from the toggle in Setup to the number in localStorage.
 *
 * The unit tests prove the board colours itself and the table ranks correctly.
 * What is proved here is the part only the whole app can show: that a score
 * typed on a court reaches storage, survives a round being marked complete, and
 * can still be changed afterwards.
 */
describe('keeping score', () => {
  /** Every scoreboard on screen, found by the label rather than by position. */
  function boards(scope: ParentNode = container): HTMLElement[] {
    return [...scope.querySelectorAll('button[aria-haspopup="dialog"]')].filter((b) =>
      (b.getAttribute('aria-label') ?? '').includes('score')
    ) as HTMLElement[];
  }

  /** The open score box. Not sheet(): the Actions sheet answers to that too. */
  function scoreBox(): HTMLElement {
    const found = container.querySelector('[role="dialog"][aria-label*="score"]');
    if (!found) throw new Error('the score box is not open');
    return found as HTMLElement;
  }

  /** Taps a key on the box's own keypad, which is the only way in. */
  function key(face: string) {
    const pad = scoreBox().querySelector('[aria-label="Score keypad"]')!;
    const found = [...pad.querySelectorAll('button')].find((b) => text(b) === face);
    if (!found) throw new Error(`no key reading ${face}`);
    click(found);
  }

  /** The two panels inside the open box, left then right. */
  function sides(): HTMLElement[] {
    return [...scoreBox().querySelectorAll('[aria-label^="Score for"]')] as HTMLElement[];
  }

  /** Empties both sides of the box that is already open. */
  function clearBoth() {
    // One key, which also leaves the typing on the first side.
    key('Clear');
  }

  /** Types both numbers into the box that is already open, and saves. */
  function fill(left: string, right: string) {
    clearBoth();
    for (const d of left) key(d);
    // Tapped across rather than left to the auto-advance, which only fires on a
    // full two digits. A score of 9 does not fill its side.
    click(sides()[1]);
    for (const d of right) key(d);
    clickButton(/^Save$/, scoreBox());
  }

  /** Opens the nth board on screen and writes a score into it. */
  function score(nth: number, left: string, right: string) {
    click(boards()[nth]);
    fill(left, right);
  }

  const firstCourt = () => storedSchedule().rounds[0].courts[0];

  describe('with scoring on', () => {
    beforeEach(() => seed(9, 9, 2, true));

    it('puts a board on every court, waiting for a number', () => {
      mount();
      generate();

      const round1 = boards(roundCard(1));
      expect(round1).toHaveLength(2);
      expect(round1[0].getAttribute('aria-label')).toMatch(/^Enter the score for court/);
    });

    it('writes what is typed through to the stored schedule', () => {
      mount();
      generate();
      score(0, '11', '7');

      expect(firstCourt().score).toEqual({ team1: 11, team2: 7 });
    });

    it('lets a score be changed after the round is marked complete', () => {
      // The whole reason the board ignores readOnly. The host ticks the round
      // off, then walks back and writes down what actually happened.
      mount();
      generate();
      score(0, '11', '7');

      markComplete(1);
      // A completed round collapses, so the board is behind View.
      clickButton(/^View$/, roundCard(1));

      click(boards(roundCard(1))[0]);
      fill('9', '11');

      expect(firstCourt().score).toEqual({ team1: 9, team2: 11 });
      expect(completedRounds()).toEqual([1]);
    });

    it('takes a score back by emptying both sides and saving', () => {
      mount();
      generate();
      score(0, '11', '7');
      expect(firstCourt().score).toBeDefined();

      click(boards()[0]);
      clearBoth();
      clickButton(/^Save$/, scoreBox());

      // Gone rather than zeroed: 0-0 is a score somebody could mean.
      expect(firstCourt().score).toBeUndefined();
    });

    it('shows the standings once something has been scored', () => {
      mount();
      generate();
      expect(container.textContent).toContain('No scores yet');

      score(0, '11', '7');
      expect(container.textContent).not.toContain('No scores yet');
      expect(container.textContent).toContain('Standings');
    });

    it('drops a score when the round it was on is reshuffled', () => {
      // Reshuffle rebuilds every round not marked complete, so the game that
      // score described no longer exists. Pinned so it stays a decision.
      mount();
      generate();
      score(0, '11', '7');

      reshuffle();
      expect(firstCourt().score).toBeUndefined();
    });

    it('keeps a score on a round already marked complete through a reshuffle', () => {
      mount();
      generate();
      score(0, '11', '7');
      markComplete(1);

      reshuffle();
      expect(firstCourt().score).toEqual({ team1: 11, team2: 7 });
    });

    it('keeps the preference but loses the scores on a new session', () => {
      mount();
      generate();
      score(0, '11', '7');

      action(/^New Round Robin$/);
      clickButton(/^Yes, Start New$/, sheet());

      expect(storedSchedule()).toBeNull();
      // The board is how this host runs their group. It outlives the afternoon.
      expect(JSON.parse(window.localStorage.getItem('pb-scoring-enabled')!)).toBe(true);
    });

    it('tells a completed round it can still be scored', () => {
      mount();
      generate();
      markComplete(1);
      clickButton(/^View$/, roundCard(1));

      expect(text(roundCard(1))).toContain('Scores can still be changed');
      expect(text(roundCard(1))).not.toContain('can no longer be edited');
    });
  });

  describe('with scoring off', () => {
    beforeEach(() => seed(9, 9, 2, false));

    it('draws no board and no standings', () => {
      mount();
      generate();

      expect(boards()).toHaveLength(0);
      expect(container.textContent).not.toContain('Standings');
    });

    it('still says a completed round is closed', () => {
      mount();
      generate();
      markComplete(1);
      clickButton(/^View$/, roundCard(1));

      expect(text(roundCard(1))).toContain('can no longer be edited');
    });

    it('turns on from the Setup panel and puts boards on the courts', () => {
      mount();
      clickButton(/^Continue to Setup/);

      // One control that goes both ways, so the same tap has to turn it back
      // off again. A switch stuck on is the failure a Yes/No pair could not have.
      const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-checked')).toBe('false');

      act(() => toggle.click());
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(JSON.parse(window.localStorage.getItem('pb-scoring-enabled')!)).toBe(true);

      act(() => toggle.click());
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(JSON.parse(window.localStorage.getItem('pb-scoring-enabled')!)).toBe(false);

      act(() => toggle.click());
      expect(JSON.parse(window.localStorage.getItem('pb-scoring-enabled')!)).toBe(true);

      clickButton(/^Generate Schedule/);
      expect(boards().length).toBeGreaterThan(0);
    });
  });
});

/**
 * The edit button on a place, and the two things behind it.
 *
 * A place on the schedule used to carry a bin and nothing else, so the only
 * thing that could be done to somebody standing on a court was send them home.
 * Getting a name wrong meant leaving the session, fixing it on the Players tab
 * and coming back. These are the two halves of what replaced it, and the one
 * rule that holds them together: the same person cannot end up with two names.
 */
describe('the player menu on a place', () => {
  beforeEach(() => seed(9, 9, 2));

  /** Fills a text input the way a person does, so React sees the change. */
  function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Every name the schedule holds for one player, across every round. */
  function namesInSchedule(playerId: string): string[] {
    const found: string[] = [];
    for (const round of storedSchedule().rounds) {
      for (const court of round.courts) {
        for (const p of [...court.team1, ...court.team2]) if (p.id === playerId) found.push(p.name);
      }
      for (const p of round.sitOuts) if (p.id === playerId) found.push(p.name);
    }
    return found;
  }

  const onCourtOne = () => storedSchedule().rounds[0].courts[0].team1[0];

  it('offers an edit button rather than a bin once a place is tapped', () => {
    mount();
    generate();

    const victim = onCourtOne();
    const card = roundCard(1);
    expect(card.querySelector(`[aria-label="Edit ${victim.name}"]`)).toBeNull();

    clickButton(new RegExp(`^${victim.name}`), card);
    expect(card.querySelector(`[aria-label="Edit ${victim.name}"]`)).not.toBeNull();
    // The old bin said Remove and did it on the spot. Nothing on a place should.
    expect(card.querySelector(`[aria-label="Remove ${victim.name}"]`)).toBeNull();
  });

  it('opens a menu with the four things a host can do to one player', () => {
    mount();
    generate();

    openPlayerMenu(onCourtOne().name);
    expect(buttons(/^Edit Player$/)).toHaveLength(1);
    // Subbing is here rather than on the Actions grid, because tapping the
    // player has already answered the question that flow starts with.
    expect(buttons(/^Sub Someone In$/)).toHaveLength(1);
    expect(buttons(/^Remove Player$/)).toHaveLength(1);
    expect(buttons(/^Cancel$/)).toHaveLength(1);

    // Tiles, like every other panel in the app answers with: the glyph large,
    // the label under it, and the whole square a target.
    for (const label of [/^Edit Player$/, /^Sub Someone In$/, /^Remove Player$/, /^Cancel$/]) {
      const tile = buttons(label)[0];
      expect(tile.querySelector('svg'), `${label} has no glyph`).toBeTruthy();
      expect(tile.className, `${label} is not a tile`).toContain('flex-col');
    }
  });

  it('puts Cancel on the left of the row it shares with Remove Player', () => {
    mount();
    generate();

    openPlayerMenu(onCourtOne().name);
    const order = buttons(/^(Edit Player|Sub Someone In|Remove Player|Cancel)$/).map(text);
    // The way out on the left, the same order every confirm panel in the sheet
    // reads in, so a host never has to look for it twice.
    expect(order).toEqual(['Edit Player', 'Sub Someone In', 'Cancel', 'Remove Player']);
  });

  it('offers Someone New above the names here too, not under them', () => {
    seed(12, 9, 2);
    mount();
    generate();

    subIn(onCourtOne().name);
    const order = [...sheet().querySelectorAll('button')].map(text);
    const newcomer = order.findIndex((t) => /^Someone New$/.test(t));
    const firstName = order.findIndex((t) => /^(Jo|Kit|Lex)/.test(t));
    expect(newcomer, 'no Someone New button').toBeGreaterThan(-1);
    expect(newcomer).toBeLessThan(firstName);
  });

  it('opens the sub panel on who is coming on, the first question answered', () => {
    mount();
    generate();

    const going = onCourtOne().name;
    subIn(going);
    expect(text(sheet())).toContain(`Who is going on for ${going}?`);
    // Not the list of who is coming off. That was the tap.
    expect(text(sheet())).not.toContain('Who is coming off?');
  });

  /**
   * Who the sub list offers, which is everybody in the group who is not already
   * playing. Somebody standing on a court cannot come on for somebody else: the
   * substitution writes them into the seat they are leaving, so a court would
   * end up with the same person twice.
   */
  it('offers only players who are not in the session', () => {
    // Twelve in the group, nine of them playing.
    seed(12, 9, 2);
    mount();
    generate();

    const playing = new Set([
      ...onCourt(storedSchedule().rounds[0]),
      ...storedSchedule().rounds[0].sitOuts.map((p) => p.name),
    ]);
    expect(playing.size).toBe(9);

    subIn(onCourtOne().name);
    // The panel's own rows, not the heading or the way out to a newcomer.
    const offered = buttons(/^[A-Z]/, sheet())
      .map((b) => NAMES.find((n) => text(b).startsWith(n)))
      .filter((n): n is string => !!n);

    expect(offered.sort()).toEqual(['Jo', 'Kit', 'Lex']);
    for (const name of offered) expect(playing.has(name)).toBe(false);
  });

  it('stops offering somebody the moment they come on', () => {
    seed(12, 9, 2);
    mount();
    generate();

    const replaced = onCourtOne().name;
    subIn(replaced);
    clickButton(/^Jo/, sheet());

    // Somebody else this time. Jo took the seat the first one left, so opening
    // the sub panel on that place would be asking who comes on for Jo.
    const second = storedSchedule().rounds[0].courts[0].team2[0].name;
    subIn(second);

    // Jo is playing now, so she is no longer somebody who could come on. The
    // player she replaced is, because a player who left may well come back.
    const offered = buttons(/^[A-Z]/, sheet())
      .map((b) => NAMES.find((n) => text(b).startsWith(n)))
      .filter((n): n is string => !!n);

    expect(offered).not.toContain('Jo');
    expect(offered).toContain(replaced);
    expect(offered.sort()).toEqual([replaced, 'Kit', 'Lex'].sort());
  });

  it('changes nothing on its own, and Cancel leaves it that way', () => {
    mount();
    generate();
    const before = storedSchedule().rounds.map(fingerprint);

    openPlayerMenu(onCourtOne().name);
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);

    clickButton(/^Cancel$/);
    expect(storedSchedule().rounds.map(fingerprint)).toEqual(before);
    expect(storedPlayers()).toHaveLength(9);
  });

  it('still takes a player off the remaining rounds, confirmation and all', () => {
    // The bin's whole job, now one step further in. Round 1 is played and keeps
    // the player; everything after it is rebuilt without them.
    mount();
    generate();
    markComplete(1);
    const played = fingerprint(storedSchedule().rounds[0]);
    const victim = storedSchedule().rounds[1].courts[0].team1[0];

    takeOff(victim.name, 2);

    const after = storedSchedule();
    expect(fingerprint(after.rounds[0])).toBe(played);
    for (const r of after.rounds.slice(1)) {
      expect(onCourt(r), `Round ${r.roundNumber}`).not.toContain(victim.name);
      expect(r.sitOuts.map((p) => p.name)).not.toContain(victim.name);
    }
  });

  it('saves a new name, rating and gender against the player', () => {
    mount();
    generate();

    const victim = onCourtOne();
    const wasMale = victim.gender === 'M';
    openPlayerMenu(victim.name);
    clickButton(/^Edit Player$/);

    const box = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(box.value).toBe(victim.name);

    typeInto(box, 'Renamed Person');
    clickButton(new RegExp(`^${wasMale ? 'F' : 'M'}$`));
    clickButton(/^Save Changes$/);

    const saved = storedPlayers().find((p) => p.id === victim.id)!;
    expect(saved.name).toBe('Renamed Person');
    expect(saved.gender).toBe(wasMale ? 'F' : 'M');
  });

  it('writes the new name through every round, including one already played', () => {
    // The schedule holds copies of the players in it. Left alone, the rounds
    // already on screen would keep the old name and the same person would be
    // two people on one page.
    mount();
    generate();
    markComplete(1);

    // Edited from round 2, because a completed round collapses and its places
    // cannot be tapped. Everybody is somewhere in round 1, on a court or on the
    // bench, so the copy it froze is exactly what this is checking.
    const victim = storedSchedule().rounds[1].courts[0].team1[0];
    expect(namesInSchedule(victim.id).length).toBeGreaterThan(1);

    openPlayerMenu(victim.name, 2);
    clickButton(/^Edit Player$/);
    typeInto(container.querySelector('input[type="text"]') as HTMLInputElement, 'Renamed Person');
    clickButton(/^Save Changes$/);

    const names = namesInSchedule(victim.id);
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names)).toEqual(new Set(['Renamed Person']));
  });

  it('leaves everyone standing where they were', () => {
    // An edit is a correction, not a reason to move four people. Only the name
    // changes, so the courts are compared with the new one written in.
    mount();
    generate();

    const victim = onCourtOne();
    const before = storedSchedule().rounds.map(fingerprint);

    openPlayerMenu(victim.name);
    clickButton(/^Edit Player$/);
    typeInto(container.querySelector('input[type="text"]') as HTMLInputElement, 'Renamed Person');
    clickButton(/^Save Changes$/);

    const after = storedSchedule().rounds.map((r) => fingerprint(r).split(victim.name).join('Renamed Person'));
    expect(after).toEqual(before.map((f) => f.split(victim.name).join('Renamed Person')));
  });

  it('saves a new rating through every round, including one already played', () => {
    // This used to be the Actions sheet's own Edit Player Rating card. The card
    // has gone and the pencil does the whole job, so the guard moved with it: a
    // rating is worth nothing if the rounds on screen still show the old one.
    mount();
    generate();
    markComplete(1);

    // Round 2, because a completed round collapses and its places cannot be
    // tapped. Everybody is somewhere in round 1, so its frozen copy is the
    // thing being checked.
    const victim = storedSchedule().rounds[1].courts[0].team1[0];
    const before = storedPlayers().find((p) => p.id === victim.id)!.rating;
    const games = storedSchedule().rounds.map(fingerprint);

    openPlayerMenu(victim.name, 2);
    clickButton(/^Edit Player$/);
    clickLabel('Raise the rating');
    clickLabel('Raise the rating');
    clickButton(/^Save Changes$/);

    // Read the new rating back rather than assuming two tenths: the stepper
    // rounds to one decimal, so a player seeded at 3.75 lands on 3.9 first.
    const saved = storedPlayers().find((p) => p.id === victim.id)!.rating;
    expect(saved).toBeGreaterThan(before);

    const after = storedSchedule();
    expect(after.rounds.map(fingerprint)).toEqual(games);
    for (const r of after.rounds) {
      const copy = [...r.courts.flatMap((c) => [...c.team1, ...c.team2]), ...r.sitOuts]
        .find((p) => p.id === victim.id);
      expect(copy?.rating, `Round ${r.roundNumber}`).toBeCloseTo(saved);
    }
  });

  it('recalculates the balance of the court they are on', () => {
    mount();
    generate();

    // Read the player off the schedule: who sits out round 1 is not fixed.
    // Raising somebody on the stronger side always widens the gap, whereas
    // raising the weaker side could close it and reopen it to the same number.
    const sum = (t: { rating: number }[]) => t.reduce((n, p) => n + p.rating, 0);
    const court = storedSchedule().rounds[0].courts[0];
    const heavier = sum(court.team1) >= sum(court.team2) ? court.team1 : court.team2;
    const raised = heavier[0];
    const before = court.ratingDiff;

    openPlayerMenu(raised.name);
    clickButton(/^Edit Player$/);
    for (let i = 0; i < 4; i++) clickLabel('Raise the rating');
    clickButton(/^Save Changes$/);

    // Read the new rating back rather than assuming four tenths: the stepper
    // rounds to one decimal, so a player seeded at 4.25 lands on 4.4 first.
    const after = storedSchedule().rounds[0].courts[0];
    const now = [...after.team1, ...after.team2].find((p) => p.id === raised.id)!;
    expect(now.rating).toBeGreaterThan(raised.rating);
    expect(after.ratingDiff).toBeCloseTo(Math.abs(sum(after.team1) - sum(after.team2)));
    expect(after.ratingDiff).toBeCloseTo(before + (now.rating - raised.rating));
  });

  it('reaches the players sitting out too', () => {
    // Nine over two courts leaves one on the bench, and the chip they sit on is
    // a place like any other.
    mount();
    generate();

    const benched = storedSchedule().rounds[0].sitOuts[0];
    const card = roundCard(1);
    clickButton(new RegExp(`^${benched.name}`), card);
    expect(card.querySelector(`[aria-label="Edit ${benched.name}"]`)).not.toBeNull();

    click(card.querySelector(`[aria-label="Edit ${benched.name}"]`)!);
    expect(buttons(/^Edit Player$/)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- Manage Groups

/**
 * Duplicating a group, through the real app.
 *
 * The panel's own tests check what the buttons do. This one checks the thing
 * only the app can answer: where the players end up. Nobody is copied, so a
 * duplicate that made a second Ava would be a bug the panel could not see.
 */
describe('duplicating a group', () => {
  function storedRosters(): { id: string; name: string }[] {
    return JSON.parse(window.localStorage.getItem('pb-rosters') ?? '[]');
  }

  function openDuplicate() {
    mount();
    clickButton(/^Manage$/);
    click(container.querySelector('[aria-label="Edit Test Group"]')!);
    clickButton(/^Duplicate$/);
  }

  beforeEach(() => seed(8, 8, 2));

  it('leaves the players where they are, and puts them in the new group too', () => {
    const before = storedPlayers();
    openDuplicate();
    clickButton(/^Save$/);

    const rosters = storedRosters();
    expect(rosters.map((r) => r.name)).toEqual(['Test Group', 'Test Group (copy)']);

    const copyId = rosters[1].id;
    const after = storedPlayers() as unknown as { id: string; rosterIds: string[] }[];
    // The same eight people, not sixteen.
    expect(after).toHaveLength(before.length);
    for (const p of after) {
      expect(p.rosterIds).toContain('g1');
      expect(p.rosterIds).toContain(copyId);
    }
  });

  it('makes the group under a typed name, and leaves the old one active', () => {
    openDuplicate();
    const box = container.querySelector('#duplicate-name') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
        box,
        'Thursday Crew'
      );
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickButton(/^Save$/);

    expect(storedRosters().map((r) => r.name)).toContain('Thursday Crew');
    // Duplicating is not a reason to move somebody off the group they were on.
    expect(JSON.parse(window.localStorage.getItem('pb-active-roster')!)).toBe('g1');
  });
});

/**
 * The Players panel after the Select Players mode was retired. Checkboxes are
 * always on, so the row tap only ever ticks a box, and the one thing it used to
 * reveal is a pencil on every row.
 *
 * Taking somebody out of a group is the pencil's job now. The panel's own
 * buttons only ever add.
 */
describe('the player roster panel', () => {
  /**
   * Ava is in both groups. The other three are only in the active one, and Elle
   * is only in the other, so All Players has somebody the group list has not.
   */
  function seedGroups(twoGroups = true, outsider = false) {
    window.localStorage.clear();
    window.localStorage.setItem(
      'pb-rosters',
      JSON.stringify(
        twoGroups
          ? [
              { id: 'g1', name: 'Test Group' },
              { id: 'g2', name: 'Other Group' },
            ]
          : [{ id: 'g1', name: 'Test Group' }]
      )
    );
    window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
    window.localStorage.setItem(
      'pb-roster',
      JSON.stringify([
        { id: 'p1', name: 'Ava', rating: 3.5, gender: 'F', rosterIds: twoGroups ? ['g1', 'g2'] : ['g1'] },
        { id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1'] },
        { id: 'p3', name: 'Cara', rating: 4, gender: 'F', rosterIds: ['g1'] },
        { id: 'p4', name: 'Dan', rating: 4, gender: 'M', rosterIds: ['g1'] },
        ...(outsider
          ? [{ id: 'p5', name: 'Elle', rating: 4, gender: 'F', rosterIds: ['g2'] }]
          : []),
      ])
    );
    runMigrations();
  }

  function storedRosters(): { id: string; name: string }[] {
    return JSON.parse(window.localStorage.getItem('pb-rosters') ?? '[]');
  }

  function rosterIdsOf(name: string): string[] {
    const found = (storedPlayers() as unknown as { name: string; rosterIds: string[] }[]).find(
      (p) => p.name === name
    );
    if (!found) throw new Error(`${name} is not in storage`);
    return found.rosterIds;
  }

  function labelled(label: string): HTMLElement {
    const el = container.querySelector(`[aria-label="${label}"]`);
    if (!el) throw new Error(`no control labelled ${label}`);
    return el as HTMLElement;
  }

  function action(re: RegExp): HTMLButtonElement {
    const found = buttons(re);
    if (found.length === 0) throw new Error(`no button matching ${re}`);
    return found[0] as HTMLButtonElement;
  }

  /** Sets a controlled input the way React will notice. */
  function type(el: HTMLInputElement, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
        el,
        value
      );
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** The names the table is showing, in the order it shows them. */
  function listedNames(): string[] {
    return [...container.querySelectorAll('.roster-table tbody tr td:nth-child(2)')].map(text);
  }

  beforeEach(() => seedGroups());

  /**
   * "Riverside Club (37)" read as a score. The heading says what it is counting
   * instead, and leaves naming the group to the panel above that does nothing
   * else.
   */
  it('heads the list with what it is counting, not the name of the group', () => {
    mount();

    const heading = container.querySelector('.roster-panel h2')!;
    // Naming the group is the job of the panel above that does nothing else.
    expect(text(heading)).toBe('Group Members (4)');
  });

  it('opens with the checkboxes on, one dead action, and no way into a mode', () => {
    mount();

    expect(labelled('Select Ava')).toBeTruthy();
    expect(labelled('Select all players')).toBeTruthy();
    // The button that used to turn all of that on is gone for good.
    expect(buttons(/Select Players/)).toHaveLength(0);
    expect(buttons(/^Cancel$/)).toHaveLength(0);

    expect(action(/^Add to Another Group$/).disabled).toBe(true);
    // Nothing is ticked, so there is nothing to count.
    expect(container.textContent).not.toContain('selected');
  });

  /**
   * Taking somebody out of a group is a one-player job done behind the pencil.
   * A red button over a list of ticks was too easy a thing to reach for.
   */
  it('offers no way to remove the ticked players', () => {
    mount();
    click(labelled('Select Ava'));

    expect(buttons(/^Remove$/)).toHaveLength(0);
    expect(container.textContent).not.toContain('Remove 1 player');
  });

  it('ticks a box from a tap anywhere on the row, and counts what is ticked', () => {
    mount();

    // The row, not the box: the tap target is the whole width of the table.
    click(container.querySelectorAll('.roster-table tbody tr')[0]);

    expect((labelled('Select Ava') as HTMLInputElement).checked).toBe(true);
    expect(container.textContent).toContain('1 selected');
    expect(action(/^Add to Another Group$/).disabled).toBe(false);

    click(container.querySelectorAll('.roster-table tbody tr')[0]);
    expect(container.textContent).not.toContain('1 selected');
    expect(action(/^Add to Another Group$/).disabled).toBe(true);
  });

  /**
   * Both of them read from the left, the count first and the button next to it.
   * The button used to be thrown to the far end of the row, which on a wide
   * screen put a stretch of nothing between a thing and its label.
   */
  it('keeps the count and the button together at the left', () => {
    mount();
    click(labelled('Select Ava'));

    const count = [...container.querySelectorAll('.roster-panel span')].find(
      (el) => text(el) === '1 selected'
    )!;
    expect(count).toBeTruthy();
    const button = action(/^Add to Another Group$/);
    expect(
      count.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Nothing pushes the button away from what comes before it.
    expect(button.className).not.toContain('ml-auto');
    expect(button.parentElement!.className).not.toContain('justify-between');
  });

  /**
   * The switch is the taller of the two things at the top of this panel. Laid
   * out as rows, its height opened a hole between the heading and the button;
   * as a column beside them, the button sits straight under the words it
   * belongs to.
   */
  it('keeps the button under the heading rather than under the switch', () => {
    mount();

    const heading = container.querySelector('.roster-panel h2')!;
    const button = action(/^Add to Another Group$/);
    expect(heading.parentElement!.contains(button)).toBe(true);
    // Beside the heading, not inside it.
    expect(heading.contains(button)).toBe(false);
    // And the switch is in the other column, not above the button.
    expect(heading.parentElement!.contains(labelled('Show All Players'))).toBe(false);
  });

  it('opens a player from the pencil without ticking their row', () => {
    mount();
    click(labelled('Edit Cara'));

    expect(container.textContent).toContain('Edit Player');
    // The pencil stops the event before the row sees it.
    expect(container.textContent).not.toContain('1 selected');
  });

  it('deletes a player from every group, and they stay gone across a relaunch', () => {
    mount();
    click(labelled('Edit Ava'));
    clickButton(/^Delete$/);

    expect(container.textContent).toContain('Delete Ava from every group?');
    expect(container.textContent).toContain('It cannot be undone.');
    clickButton(/^Yes, Delete$/);

    expect(storedPlayers().map((p) => p.name)).not.toContain('Ava');

    remount();
    expect(listedNames()).not.toContain('Ava');
    // Not merely dropped from the group that was open: gone from the other too.
    // The picker names each group with its head count alongside.
    clickButton(/^Test Group$/);
    clickButton(/^Other Group0 players/);
    expect(listedNames()).not.toContain('Ava');
  });

  it('leaves the player alone when the delete warning is cancelled', () => {
    mount();
    click(labelled('Edit Ava'));
    clickButton(/^Delete$/);
    clickButton(/^Cancel$/);

    expect(rosterIdsOf('Ava')).toEqual(['g1', 'g2']);
  });

  it('sets the group names in bold, because they are the choice being made', () => {
    mount();
    click(labelled('Select Ava'));
    clickButton(/^Add to Another Group$/);

    const row = [...container.querySelectorAll('label')].find((l) =>
      text(l).includes('Other Group')
    )!;
    expect(row, 'no row for the other group').toBeTruthy();
    const name = [...row.querySelectorAll('span')].find((s) => text(s) === 'Other Group')!;
    expect(name, 'the name is not in a span of its own').toBeTruthy();
    expect(name.className).toContain('font-bold');
  });

  it('makes the second group from inside Add to Another Group, already ticked', () => {
    seedGroups(false);
    mount();

    click(labelled('Select Ben'));
    clickButton(/^Add to Another Group$/);
    expect(container.textContent).toContain('This is your only group.');
    // Nowhere to save to until a group exists.
    expect(action(/^Save$/).disabled).toBe(true);

    type(labelled('New group name') as HTMLInputElement, 'Thursday Crew');
    clickButton(/^Create$/);

    // Created and ticked in one press, so Save is the very next one.
    expect(action(/^Save$/).disabled).toBe(false);
    clickButton(/^Save$/);

    const made = storedRosters().find((r) => r.name === 'Thursday Crew');
    expect(made).toBeTruthy();
    expect(rosterIdsOf('Ben')).toEqual(['g1', made!.id]);
    // Adding to a group does not take them out of this one.
    expect(listedNames()).toContain('Ben');
  });

  /**
   * Show All Players. Finding somebody used to mean knowing which group they
   * were in and going there first.
   */
  describe('showing every player', () => {
    beforeEach(() => seedGroups(true, true));

    /** The heading's own glyph. One, always, and not always the same one. */
    function glyph(): SVGElement {
      const found = container.querySelectorAll('.roster-panel h2 svg');
      if (found.length !== 1) throw new Error(`${found.length} glyphs on the heading`);
      return found[0] as unknown as SVGElement;
    }

    it('swaps the group for the whole pool, and back again', () => {
      mount();

      // Elle is in the other group, so the group list has never seen her.
      expect(listedNames()).not.toContain('Elle');
      const group = glyph().outerHTML;
      const groupShapes = glyph().children.length;

      click(labelled('Show All Players'));

      expect(text(container.querySelector('.roster-panel h2')!)).toBe('All Players (5)');
      expect(listedNames()).toContain('Elle');
      // Three people for a group, a crowd for everybody: another drawing, and a
      // busier one, because the number of figures is what the glyph is saying.
      expect(glyph().outerHTML).not.toBe(group);
      expect(glyph().children.length).toBeGreaterThan(groupShapes);

      click(labelled('Show All Players'));

      expect(text(container.querySelector('.roster-panel h2')!)).toBe('Group Members (4)');
      expect(listedNames()).not.toContain('Elle');
      expect(glyph().outerHTML).toBe(group);
    });

    /**
     * Ticks are dropped on the way through. Somebody ticked in one list and
     * hidden in the other would still be counted, and Add to Another Group
     * would send a player the host can no longer see.
     */
    it('drops the ticks when the list changes under them', () => {
      mount();
      click(labelled('Select Ava'));
      expect(container.textContent).toContain('1 selected');

      click(labelled('Show All Players'));
      expect(container.textContent).not.toContain('1 selected');
      expect((labelled('Select Ava') as HTMLInputElement).checked).toBe(false);
    });

    /**
     * Left on, changing group would leave every row where it was, and the
     * switch would look like it had swallowed the change.
     */
    it('goes back to the group list when the group changes', () => {
      mount();
      click(labelled('Show All Players'));
      expect(listedNames()).toContain('Elle');

      clickButton(/^Test Group$/);
      clickButton(/^Other Group/);

      expect(text(container.querySelector('.roster-panel h2')!)).toBe('Group Members (2)');
      expect(listedNames()).toEqual(['Ava', 'Elle']);
    });

    /**
     * "Another" only means anything against a list that is this group. Over the
     * whole pool there is no this group to be another of, and the group in front
     * becomes a target like any other.
     */
    it('drops the word Another, and offers this group, over the whole pool', () => {
      /** The Add to Group dialog, found by its heading. */
      function dialog(): HTMLElement {
        const found = [...container.querySelectorAll('.fixed.inset-0')].find((d) =>
          text(d).includes('player')
        );
        if (!found) throw new Error('the add dialog is not open');
        return found as HTMLElement;
      }

      mount();
      // On the group's own list, this group is not on offer.
      click(labelled('Select Ava'));
      clickButton(/^Add to Another Group$/);
      expect(text(dialog())).toContain('Add 1 player to');
      expect(text(dialog())).not.toContain('Test Group');
      clickButton(/^Cancel$/);

      click(labelled('Show All Players'));
      expect(buttons(/^Add to Another Group$/)).toHaveLength(0);

      click(labelled('Select Elle'));
      clickButton(/^Add to Group$/);

      expect(text(dialog())).toContain('the groups they’re already in');
      // Elle is not in Test Group, and putting her there is the obvious thing
      // to want from a list she was found on.
      expect(text(dialog())).toContain('Test Group');
    });

    /**
     * An empty group used to replace the whole panel, switch included, which
     * would have left no way to find out where everybody had got to.
     */
    it('keeps the switch on a group with nobody in it', () => {
      window.localStorage.setItem('pb-active-roster', JSON.stringify('g2'));
      window.localStorage.setItem(
        'pb-roster',
        JSON.stringify([{ id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1'] }])
      );
      mount();

      expect(text(container.querySelector('.roster-panel h2')!)).toBe('Group Members (0)');
      expect(container.textContent).toContain('Nobody in this group yet');
      // Nothing to tick, so nothing to add to another group either.
      expect(buttons(/^Add to Another Group$/)).toHaveLength(0);

      click(labelled('Show All Players'));
      expect(listedNames()).toEqual(['Ben']);
    });
  });

  /**
   * One shape for every panel in the app: a teal glyph centred on top, the
   * title centred under it, both the same size wherever you are. Checked here
   * on two dialogs that used to disagree with each other about all three.
   */
  describe('the way a dialog is headed', () => {
    /** The open dialog, whichever it is. */
    function dialog(): HTMLElement {
      const found = container.querySelector('.fixed.inset-0 > div');
      if (!found) throw new Error('no dialog is open');
      return found as HTMLElement;
    }

    function checkHeading(title: string) {
      const glyph = dialog().querySelector('svg')!;
      expect(glyph).toBeTruthy();
      expect(glyph.parentElement!.className).toContain('text-brand-teal');

      const h2 = dialog().querySelector('h2')!;
      expect(text(h2)).toBe(title);
      expect(h2.className).toContain('text-[1.35rem]');
      expect(h2.className).toContain('font-extrabold');
      expect(h2.className).toContain('text-center');
      // The glyph comes first, so the title sits under it.
      expect(
        glyph.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    it('heads Manage Groups that way', () => {
      mount();
      clickButton(/^Manage$/);
      checkHeading('Manage Groups');
    });

    it('heads Edit Player that way', () => {
      mount();
      click(labelled('Edit Ava'));
      checkHeading('Edit Player');
    });

    /**
     * Tapping into a field inside a dialog used to scroll the page behind it,
     * and closing the dialog left the host somewhere they had never been.
     */
    it('holds the page still underneath', () => {
      // The pane is born with each mount, so unlike the shared body the old
      // version of this test had to scrub, it starts provably unlocked.
      mount();
      expect(scroller().style.overflow).not.toBe('hidden');

      clickButton(/^Manage$/);
      expect(scroller().style.overflow).toBe('hidden');

      clickButton(/^Done$/);
      expect(scroller().style.overflow).not.toBe('hidden');
    });
  });

  /**
   * Twenty players is twenty names typed in a row. Letting the keyboard drop
   * between each of them is twenty taps back into the same field.
   */
  it('leaves the caret in the name field after a player is added', () => {
    mount();
    const box = container.querySelector('input[placeholder="Enter name"]') as HTMLInputElement;
    type(box, 'Zed');
    clickButton(/^Add Player$/);

    expect(listedNames()).toContain('Zed');
    expect(document.activeElement).toBe(box);
    // And it is empty again, ready for the next one.
    expect(box.value).toBe('');
  });

  /**
   * A roster is typed in in runs. Snapping back to M after every save means
   * setting it again for each of the women.
   */
  it('leaves the gender where it was put', () => {
    mount();
    const box = container.querySelector('input[placeholder="Enter name"]') as HTMLInputElement;
    const isOn = (face: string) =>
      buttons(new RegExp(`^${face}$`))[0].className.includes('bg-brand-teal');

    clickButton(/^F$/);
    expect(isOn('F')).toBe(true);

    type(box, 'Zoe');
    clickButton(/^Add Player$/);

    expect(storedPlayers().find((p) => p.name === 'Zoe')!.gender).toBe('F');
    // Still on F for the next one.
    expect(isOn('F')).toBe(true);
    expect(isOn('M')).toBe(false);
  });

  /**
   * A field labelled Player Name with nothing said about autocomplete is read
   * by browsers and password managers as somewhere to put the owner's own
   * details, and what they open over it moves the page about while a name is
   * being typed.
   */
  it('turns off every offer of help on the name field', () => {
    mount();
    const box = container.querySelector('input[placeholder="Enter name"]')!;

    expect(box.getAttribute('autocomplete')).toBe('off');
    expect(box.getAttribute('data-1p-ignore')).not.toBeNull();
    expect(box.getAttribute('data-lpignore')).toBe('true');
    // A name wants its first letter, and nothing else, changed for it.
    expect(box.getAttribute('autocapitalize')).toBe('words');
    expect(box.getAttribute('autocorrect')).toBe('off');
    expect(box.getAttribute('spellcheck')).toBe('false');
  });
});

/**
 * The settings drawer, and the panel it slides aside.
 */
describe('the settings drawer', () => {
  beforeEach(() => seed(6, 6, 0));

  /** The panel is slid aside only while the drawer is open. */
  function slidAside(): boolean {
    return container.querySelector('.app-panel')!.className.includes('-translate-x-[80%]');
  }

  /** The sheet of nothing over the panel that takes the click. */
  function veil(): HTMLElement | null {
    return container.querySelector('.app-panel > .absolute.inset-0[aria-hidden="true"]');
  }

  it('closes from a tap anywhere on the panel behind it', () => {
    mount();
    expect(veil()).toBeNull();

    clickLabel('Open settings');
    expect(slidAside()).toBe(true);
    expect(veil()).toBeTruthy();

    click(veil()!);

    expect(slidAside()).toBe(false);
    expect(veil()).toBeNull();
  });

  /** The button still says what it does, and still does it. */
  it('still closes from the button that opened it', () => {
    mount();
    clickLabel('Open settings');
    clickLabel('Close settings');

    expect(slidAside()).toBe(false);
  });

  it('leaves the items in the drawer working', () => {
    mount();
    clickLabel('Open settings');
    clickButton(/^Instructions$/);

    expect(container.textContent).toContain('Quick start');
    // Opening one of its panels does not put the drawer away, so closing the
    // panel lands back where it was left.
    expect(slidAside()).toBe(true);
  });

  /**
   * The robin at the top of it, which puts a costume on once in a while.
   *
   * Which costume is robins.test.ts's business. What matters up here is how
   * often, and that a visit is counted once.
   */
  describe('the robin at the top of it', () => {
    const robin = () =>
      container.querySelector('[aria-label="Settings"] img')!.getAttribute('src');

    const COSTUME = /^\/robins\/[a-z]+\.webp$/;

    // The queue is module state, so it outlives the test that filled it.
    beforeEach(() => {
      robinTesting.forget();
      vi.unstubAllGlobals();
    });

    function visit() {
      clickLabel('Open settings');
      clickLabel('Close settings');
    }

    /** Every src handed to a `new Image()` from here on. */
    function fetched(): string[] {
      const srcs: string[] = [];
      const real = window.Image;
      vi.stubGlobal(
        'Image',
        class extends real {
          set src(value: string) {
            srcs.push(value);
            super.src = value;
          }
          get src() {
            return super.src;
          }
        }
      );
      return srcs;
    }

    it('fetches the next costume before the drawer is ever opened', () => {
      // An image already on screen goes on painting the picture it has until
      // the new one is fetched and decoded, measured at 400ms on a throttled
      // connection. So the drawer has to be handed a picture that is already
      // there, which means fetching it an open early.
      window.localStorage.setItem('pb-settings-opens', '5');
      const srcs = fetched();

      mount();

      const warmed = srcs.filter((s) => s.startsWith('/robins/'));
      expect(warmed).toHaveLength(1);
      clickLabel('Open settings');
      expect(robin()).toBe(warmed[0]);
    });

    it('fetches nothing on a session that is nowhere near one', () => {
      window.localStorage.setItem('pb-settings-opens', '1');
      const srcs = fetched();

      mount();
      clickLabel('Open settings');

      expect(srcs.filter((s) => s.startsWith('/robins/'))).toEqual([]);
      expect(robin()).toBe('/icon-192.png');
    });

    it('opens on the app icon five times, and dresses up on the sixth', () => {
      mount();
      for (let n = 1; n <= 5; n++) {
        clickLabel('Open settings');
        expect(robin(), `open ${n}`).toBe('/icon-192.png');
        clickLabel('Close settings');
      }

      clickLabel('Open settings');
      expect(robin()).toMatch(COSTUME);
    });

    it('counts a visit on the way in and not on the way out', () => {
      mount();
      // Three visits, six button presses. Counting the way out as well would
      // have reached the sixth open by now.
      visit();
      visit();
      visit();

      expect(window.localStorage.getItem('pb-settings-opens')).toBe('3');
      clickLabel('Open settings');
      expect(robin()).toBe('/icon-192.png');
    });

    it('leaves the costume on while the drawer slides away', () => {
      // The drawer is always mounted and takes 300ms to go. Anything that put
      // the icon back on the way out would change the bird in front of somebody
      // watching it leave.
      mount();
      for (let n = 1; n <= 5; n++) visit();
      clickLabel('Open settings');
      const worn = robin();
      expect(worn).toMatch(COSTUME);

      clickLabel('Close settings');
      expect(robin()).toBe(worn);
    });
  });
});

/**
 * The Select Players grid and the Partners panel above it.
 *
 * Both are one row per player, and the two have to agree about where the gender
 * and the rating sit, because Set Partners is the same list in another state.
 */
describe('the Setup player list', () => {
  beforeEach(() => seed(8, 8, 2));

  /** One row of the grid, found by the name it opens with. */
  function row(name: string): HTMLElement {
    const found = [...container.querySelectorAll('label, button')].find((el) =>
      text(el).startsWith(name)
    );
    if (!found) throw new Error(`no row for ${name}`);
    return found as HTMLElement;
  }

  function storedPartnerships(): { player1Id: string; player2Id: string }[] {
    return JSON.parse(window.localStorage.getItem('pb-partnerships') ?? '[]');
  }

  /** Links two players, from the Setup page, and comes back out of the mode. */
  function pair(one: string, two: string) {
    clickButton(/^Set Partners$/);
    clickButton(new RegExp(`^${one}`));
    clickButton(new RegExp(`^${two}`));
    clickButton(/^Done Pairing$/);
  }

  it('holds the gender and the rating together on the right of a row', () => {
    mount();
    clickButton(/^Continue to Setup/);

    // Name, then gender, then rating. What moved is which of them takes the
    // space left over: beside the name the gender read as part of it, and no
    // two rows lined their ratings up.
    const spans = row('Ava').querySelectorAll('span');
    expect(text(spans[0])).toBe('Ava');
    expect(text(spans[1])).toBe('M');
    expect(text(spans[2])).toBe('3.5');
    expect(spans[1].className).toContain('ml-auto');
    expect(spans[2].className).not.toContain('ml-auto');
  });

  it('says the same thing in the Set Partners view', () => {
    mount();
    clickButton(/^Continue to Setup/);
    clickButton(/^Set Partners$/);

    const spans = row('Ava').querySelectorAll('span');
    expect(text(spans[1])).toBe('M');
    expect(spans[1].className).toContain('ml-auto');
    expect(spans[2].className).not.toContain('ml-auto');
  });

  it('breaks every couple at once, and hands them back still ticked', () => {
    mount();
    clickButton(/^Continue to Setup/);
    pair('Ava', 'Ben');
    pair('Cara', 'Dan');

    expect(storedPartnerships()).toHaveLength(2);
    expect(container.textContent).toContain('Partners');

    clickButton(/^Unlink All$/);

    expect(storedPartnerships()).toEqual([]);
    // The panel goes with the last couple, and all four are back in the grid
    // with their boxes still ticked, which is what makes this cheap to undo.
    expect(buttons(/^Unlink All$/)).toHaveLength(0);
    for (const name of ['Ava', 'Ben', 'Cara', 'Dan']) {
      expect((row(name).querySelector('input') as HTMLInputElement).checked).toBe(true);
    }
  });

  it('offers nothing to unlink until there is a couple to break', () => {
    mount();
    clickButton(/^Continue to Setup/);

    expect(buttons(/^Unlink All$/)).toHaveLength(0);
  });
});

/**
 * Changing groups without losing the group you are leaving.
 *
 * This used to be a red dialog warning that switching would clear the session,
 * and it was only reachable from the Players tab. Now every group keeps its own
 * afternoon — the schedule, the scores, the couples, the court count and the tab
 * it was left on — and the group name in the banner is the way between them.
 */
describe('changing groups', () => {
  const RIVERSIDE = 'Riverside Club';
  const TUESDAY = 'Tuesday Crew';

  function seedTwoGroups() {
    window.localStorage.clear();
    window.localStorage.setItem(
      'pb-rosters',
      JSON.stringify([
        { id: 'g1', name: RIVERSIDE },
        { id: 'g2', name: TUESDAY },
      ])
    );
    window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
    const make = (names: string[], rosterId: string, prefix: string) =>
      names.map((name, i) => ({
        id: `${prefix}${i + 1}`,
        name,
        rating: 3.5 + (i % 4) * 0.25,
        gender: i % 2 === 0 ? 'M' : 'F',
        rosterIds: [rosterId],
      }));
    window.localStorage.setItem(
      'pb-roster',
      JSON.stringify([
        ...make(NAMES, 'g1', 'r'),
        ...make(['Iris', 'Jack', 'Kim', 'Lou', 'Mia', 'Ned', 'Opal', 'Pete'], 'g2', 't'),
      ])
    );
    window.localStorage.setItem('pb-num-courts', JSON.stringify(2));
    window.localStorage.setItem('pb-num-rounds', JSON.stringify(4));
    runMigrations();
  }

  beforeEach(seedTwoGroups);

  const stored = (key: string, fallback: string) =>
    JSON.parse(window.localStorage.getItem(key) ?? fallback);

  /**
   * Through the group name in the banner, which is the whole point of the
   * feature. The name is the button, so its text is exactly the group's.
   */
  function changeGroup(from: string, to: string) {
    clickButton(new RegExp(`^${from}$`), container.querySelector('header')!);
    clickButton(new RegExp(`^${to}`));
  }

  /** Riverside set up on three courts, one couple linked, and a schedule run. */
  function runRiverside() {
    clickButton(/^Continue to Setup/);
    clickButton(/^Select All$/);
    clickLabel('More courts'); // 2 -> 3
    clickButton(/^Set Partners$/);
    clickButton(/^Ava/);
    clickButton(/^Ben/);
    clickButton(/^Done Pairing$/);
    clickButton(/^Generate Schedule/);
  }

  it('carries the whole afternoon across and back', () => {
    mount();
    runRiverside();
    markComplete(1);
    const built = JSON.stringify(storedSchedule());

    // Nothing is asked, because nothing is being thrown away.
    changeGroup(RIVERSIDE, TUESDAY);
    expect(container.textContent).not.toContain('Switch groups?');

    // A group nobody has set up opens on Players, with its own members.
    expect(text(container.querySelector('.roster-panel h2')!)).toBe('Group Members (8)');
    expect(stored('pb-schedule', 'null')).toBeNull();
    // And the courts already in use rather than a reset to the default three.
    expect(stored('pb-num-courts', '0')).toBe(3);

    clickButton(/^Continue to Setup/);
    clickButton(/^Select All$/);
    clickLabel('Fewer courts'); // 3 -> 2

    changeGroup(TUESDAY, RIVERSIDE);

    // Straight back onto the schedule, exactly as it was left.
    expect(container.querySelectorAll('.round-card').length).toBeGreaterThan(0);
    expect(JSON.stringify(storedSchedule())).toBe(built);
    expect(completedRounds()).toEqual([1]);
    expect(stored('pb-num-courts', '0')).toBe(3);
    expect(stored('pb-partnerships', '[]')).toHaveLength(1);
  });

  it('gives each group back the tab it was left on', () => {
    mount();
    runRiverside();

    changeGroup(RIVERSIDE, TUESDAY);
    clickButton(/^Continue to Setup/);
    expect(container.textContent).toContain('Select Players');

    // Riverside was left on the schedule, Tuesday on Setup, and each comes back
    // to its own.
    changeGroup(TUESDAY, RIVERSIDE);
    expect(container.querySelectorAll('.round-card').length).toBeGreaterThan(0);

    changeGroup(RIVERSIDE, TUESDAY);
    expect(container.querySelectorAll('.round-card')).toHaveLength(0);
    expect(container.textContent).toContain('Select Players');
  });

  it('reopens the group and the tab a relaunch closed on', () => {
    mount();
    runRiverside();
    changeGroup(RIVERSIDE, TUESDAY);
    clickButton(/^Continue to Setup/);

    remount();

    expect(container.textContent).toContain('Select Players');
    expect(buttons(new RegExp(`^${TUESDAY}$`))).toHaveLength(1);
  });

  it('leaves the banner alone on Players, where My Groups is already on the page', () => {
    mount();

    // The app's own name up there, and nothing to tap on it. The group name and
    // its chevron are further down the page, on the My Groups panel.
    const header = container.querySelector('header')!;
    expect(buttons(new RegExp(`^${RIVERSIDE}$`), header)).toHaveLength(0);
    expect(header.textContent).toContain('Pickleball');
  });

  it('files each group under its own name, and nowhere else', () => {
    mount();
    runRiverside();
    changeGroup(RIVERSIDE, TUESDAY);

    expect(Object.keys(stored('pb-group-sessions', '{}'))).toEqual(['g1']);
    expect(stored('pb-group-sessions', '{}').g1.schedule).not.toBeNull();
  });
});

/**
 * What labels a control, anywhere in the app: bold and small, above the thing
 * it names. In the ordinary weight at that size a label reads as a note about
 * the field rather than the name of it.
 */
describe('the label over a control', () => {
  beforeEach(() => seed(6, 6, 2));

  it('is bold on every field of the Add Player form', () => {
    mount();
    const labels = [...container.querySelectorAll('.roster-panel, form')]
      .flatMap((el) => [...el.querySelectorAll('label, p')])
      .filter((el) => ['Player Name', 'Rating', 'Gender'].includes(text(el)));

    expect(labels).toHaveLength(3);
    for (const label of labels) {
      expect(label.className).toContain('font-bold');
      expect(label.className).toContain('text-sm');
    }
  });

  it('is bold over the group ticks on Edit Player, and the list grows with the screen', () => {
    mount();
    click(container.querySelector('[aria-label="Edit Ava"]')!);

    const groups = [...container.querySelectorAll('p')].find((p) => text(p) === 'Groups')!;
    expect(groups).toBeTruthy();
    expect(groups.className).toContain('font-bold');

    // A share of the screen, not a flat 176px, which was six groups on any
    // phone ever made.
    const list = groups.parentElement!.querySelector('.overflow-y-auto')!;
    expect(list.className).toContain('max-h-[45vh]');
    expect(list.className).not.toContain('max-h-44');
  });
});

/**
 * The panel a place on a court opens. It described a player in words the rest
 * of the app does not use: M and F on every other screen, and a Rating rather
 * than being "rated".
 */
describe('the player panel on a court', () => {
  beforeEach(() => seed(8, 8, 2));

  it('says male or female, and gives the rating a label', () => {
    mount();
    generate();

    // Tap a place to select it, which turns its rating into the pencil.
    const first = storedSchedule()!.rounds[0].courts[0].team1[0];
    clickButton(new RegExp(`^${first.name}`), container.querySelector('.round-card')!);
    click(container.querySelector(`[aria-label="Edit ${first.name}"]`)!);

    const panel = [...container.querySelectorAll('.fixed.inset-0')].pop()!;
    expect(text(panel)).toContain(first.gender === 'F' ? 'Female' : 'Male');
    expect(text(panel)).toContain(`Rating: ${first.rating.toFixed(1)}`);
    expect(text(panel)).not.toContain('rated');
    expect(text(panel)).not.toMatch(/\b(Man|Woman)\b/);
  });
});

/**
 * The two ways between a round and the table it feeds.
 *
 * A session of eight rounds is several screens tall and the standings are under
 * all of them, so each round card offers the way down and the table offers the
 * way back up.
 */
describe('the way between a round and the standings', () => {
  // These spies are installed over and over in one file, and vitest hands back
  // the spy that is already there rather than a fresh one. Without this the
  // calls of the last test count towards the next.
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /** Every element scrollIntoView was called on, in order. */
  function watchScroll(): Element[] {
    const seen: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (
      this: Element
    ) {
      seen.push(this);
    });
    return seen;
  }

  it('offers View Standings on a round that keeps score', () => {
    seed(9, 9, 2, true);
    mount();
    generate();

    expect(buttons(/^View Standings$/, roundCard(1))).toHaveLength(1);
  });

  it('offers none at all when the session keeps no score', () => {
    // There would be nothing at the bottom of the page to scroll to.
    seed(9, 9, 2, false);
    mount();
    generate();

    expect(buttons(/^View Standings$/)).toHaveLength(0);
    expect(buttons(/^Back to Top$/)).toHaveLength(0);
  });

  it('scrolls the standings themselves into view, not something near them', () => {
    seed(9, 9, 2, true);
    mount();
    generate();
    const seen = watchScroll();

    clickButton(/^View Standings$/, roundCard(1));

    expect(seen).toHaveLength(1);
    expect(text(seen[0].querySelector('h3')!)).toBe('Standings');
  });

  it('goes to the very top while every round is still to play', () => {
    seed(9, 9, 2, true);
    mount();
    generate();
    const scrollTo = vi.fn();
    scroller().scrollTo = scrollTo as never;

    clickButton(/^Back to Top$/);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('goes to the next round to play once anything is finished', () => {
    // Not to the header: with rounds behind them the top of the page is a
    // banner and a row of tabs, and what they came back for is under it.
    seed(9, 9, 2, true);
    mount();
    generate();
    markComplete(1);
    markComplete(2);
    const scrollTo = vi.fn();
    scroller().scrollTo = scrollTo as never;
    const seen = watchScroll();

    clickButton(/^Back to Top$/);

    // Nothing here may fall back to the top of the page: the round card is
    // the destination, and the pane must not be sent anywhere on top of it.
    expect(scrollTo).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    expect(text(seen[0].querySelector('h3')!)).toBe('Round 3');
    // The 24px gap between cards stays on screen, so the completed round above
    // ends on the top edge rather than a hair over it.
    expect((seen[0] as HTMLElement).className).toContain('scroll-mt-6');
  });

  it('goes back to the very top once there is no round left to play', () => {
    seed(9, 9, 2, true);
    mount();
    generate();
    for (let n = 1; n <= 8; n++) markComplete(n);
    const scrollTo = vi.fn();
    scroller().scrollTo = scrollTo as never;

    clickButton(/^Back to Top$/);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('goes straight there for anybody who has asked for less movement', () => {
    seed(9, 9, 2, true);
    mount();
    generate();
    // Neither scrollIntoView nor scrollTo consults this setting on its own,
    // unlike the CSS property, so the page has to ask.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const scrollTo = vi.fn();
    scroller().scrollTo = scrollTo as never;

    clickButton(/^Back to Top$/);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('leaves the link off a round that has been put away', () => {
    // A completed round collapses to a single bar, and a stack of them at the
    // top of the page would double in height for a link that is a scroll away.
    seed(9, 9, 2, true);
    mount();
    generate();
    markComplete(1);

    expect(buttons(/^View Standings$/, roundCard(1))).toHaveLength(0);
    expect(buttons(/^View Standings$/, roundCard(2))).toHaveLength(1);
  });
});

/**
 * The notice that says tonight is partner play.
 *
 * It used to live inside the pairing list, which meant Done Pairing — the one
 * button anybody presses right after making the last couple — took it away.
 */
describe('the partner play notice', () => {
  beforeEach(() => seed(8, 8, 2));

  function pair(one: string, two: string) {
    clickButton(new RegExp(`^${one}`));
    clickButton(new RegExp(`^${two}`));
  }

  /** Pairs everybody up, and comes back out of the mode. */
  function pairEveryone() {
    clickButton(/^Set Partners$/);
    pair('Ava', 'Ben');
    pair('Cara', 'Dan');
    pair('Eve', 'Finn');
    pair('Gus', 'Hana');
  }

  it('appears as soon as the last couple is made', () => {
    mount();
    clickButton(/^Continue to Setup/);
    expect(container.textContent).not.toContain('Partner play:');

    pairEveryone();

    expect(container.textContent).toContain('Partner play: 4 teams');
  });

  it('stays up after Done Pairing', () => {
    mount();
    clickButton(/^Continue to Setup/);
    pairEveryone();
    clickButton(/^Done Pairing$/);

    expect(container.textContent).toContain('Partner play: 4 teams');
  });

  it('says it louder than the sentence under it', () => {
    mount();
    clickButton(/^Continue to Setup/);
    pairEveryone();
    clickButton(/^Done Pairing$/);

    const title = [...container.querySelectorAll('p')].find((p) =>
      text(p).startsWith('Partner play:')
    )!;
    expect(title.className).toContain('text-lg');
  });

  it('warns about the one person left out, on both sides of Done Pairing', () => {
    // Partner play tolerates exactly one odd person, and they play nothing.
    // That warning travels with the notice: it is the same situation.
    seed(9, 9, 2);
    mount();
    clickButton(/^Continue to Setup/);
    pairEveryone(); // eight of the nine, leaving Ivy

    expect(container.textContent).toContain('Partner play: 4 teams');
    expect(container.textContent).toContain('Ivy');
    expect(container.textContent).toContain('will sit out every round');

    clickButton(/^Done Pairing$/);

    expect(container.textContent).toContain('will sit out every round');
  });

  it('goes away again when the couples are broken up', () => {
    mount();
    clickButton(/^Continue to Setup/);
    pairEveryone();
    clickButton(/^Done Pairing$/);
    clickButton(/^Unlink All$/);

    expect(container.textContent).not.toContain('Partner play:');
  });
});

/**
 * Reaching a player who is held by a padlock.
 *
 * Every one of these used to be impossible. A locked seat was dead to the touch,
 * so correcting a linked player's spelling meant undoing the padlock, tapping
 * them, and putting it back afterwards — and forgetting the last step quietly
 * changed who the scheduler kept together. Now the seat answers a tap with its
 * pencil and nothing else, which is the one thing a locked player has to offer.
 */
describe('a linked player', () => {
  /**
   * Ava and Ben linked in Setup, then a schedule built around it.
   *
   * Ten in the group and nine of them playing, so Jo is on the bench and there
   * is somebody to stand in.
   */
  function seedLinked(inGroup = 10, playing = 9, courts = 2) {
    seed(inGroup, playing, courts);
    window.localStorage.setItem(
      'pb-partnerships',
      JSON.stringify([{ player1Id: 'p1', player2Id: 'p2' }])
    );
    mount();
    generate();
  }

  /** The seat holding one player on a round, whatever state it is in. */
  function seat(name: string, round = 1): HTMLElement {
    const found = buttons(new RegExp(`^${name}`), roundCard(round));
    if (found.length === 0) throw new Error(`no seat for ${name} on round ${round}`);
    return found[0];
  }

  function pencil(name: string, round = 1): Element | null {
    return roundCard(round).querySelector(`[aria-label="Edit ${name}"]`);
  }

  /** Every padlocked pair on a round, by the names either side of the padlock. */
  function padlocked(round = 1): string[][] {
    return [...roundCard(round).querySelectorAll('[aria-label="Unlock pair"]')].map((lock) => {
      const column = lock.parentElement as HTMLElement;
      return [...column.children]
        .filter((el) => el !== lock && el.tagName === 'BUTTON')
        .map((el) => NAMES.find((n) => text(el).startsWith(n)) ?? text(el));
    });
  }

  /** Which round Ava and Ben are both playing in, since a couple can sit out. */
  function roundWithPair(): number {
    const round = storedSchedule().rounds.find((r) =>
      r.courts.some((c) =>
        [c.team1, c.team2].some(
          (t) => t.some((p) => p.name === 'Ava') && t.some((p) => p.name === 'Ben')
        )
      )
    );
    if (!round) throw new Error('Ava and Ben are never on a court together');
    return round.roundNumber;
  }

  it('shows its pencil when tapped, and no more than that', () => {
    seedLinked();
    const n = roundWithPair();
    const before = seat('Ava', n).className;

    click(seat('Ava', n));

    expect(pencil('Ava', n)).not.toBeNull();
    // Not selected. The blue edge and the darker fill are an offer to swap, and
    // a locked player has no swap to make.
    expect(seat('Ava', n).className).not.toContain('ring-blue-500');
    expect(seat('Ava', n).className).not.toContain('bg-blue-200');
    expect(seat('Ava', n).className).not.toContain('bg-orange-200');
    // The padlock's own black edge is what it was wearing before the tap.
    expect(seat('Ava', n).className).toBe(before);
  });

  it('puts the pencil away when tapped again', () => {
    seedLinked();
    const n = roundWithPair();

    click(seat('Ava', n));
    expect(pencil('Ava', n)).not.toBeNull();

    click(seat('Ava', n));
    expect(pencil('Ava', n)).toBeNull();
  });

  it('says what the pencil is for, and where the swap went', () => {
    seedLinked();
    const n = roundWithPair();
    click(seat('Ava', n));

    expect(container.textContent).toContain('Tap the pencil for more. Unlock the pair to swap.');
    // Not the line an unlocked seat gets, which offers a swap this seat cannot
    // make.
    expect(container.textContent).not.toContain('Tap another player to swap');
  });

  it('opens the same panel, with all three things on it', () => {
    seedLinked();
    const n = roundWithPair();
    click(seat('Ava', n));
    click(pencil('Ava', n)!);

    const panel = sheet();
    expect(text(panel)).toContain('Edit Player');
    expect(text(panel)).toContain('Sub Someone In');
    expect(text(panel)).toContain('Remove Player');
  });

  it('still cannot be swapped with anybody', () => {
    seedLinked();
    const n = roundWithPair();
    const before = fingerprint(storedSchedule().rounds[n - 1]);

    click(seat('Ava', n));
    // Somebody on the other side of the same court. Tapping them after a
    // selection is what trades two places over.
    const other = onCourt(storedSchedule().rounds[n - 1]).find(
      (name) => name !== 'Ava' && name !== 'Ben'
    )!;
    click(seat(other, n));

    expect(fingerprint(storedSchedule().rounds[n - 1])).toBe(before);
  });

  it('offers no pencil once the round is complete', () => {
    seedLinked();
    const n = roundWithPair();
    markComplete(n);
    // A completed round folds itself away. Open it again, or there are no seats
    // on screen to tap and the test would pass without proving anything.
    clickButton(/^View$/, roundCard(n));

    click(seat('Ava', n));

    expect(pencil('Ava', n)).toBeNull();
  });

  it('keeps its padlock when somebody stands in for it', () => {
    seedLinked();
    // Read before the substitution: Ava is gone afterwards, and the round is
    // the one the padlock has to still be on.
    const n = roundWithPair();
    subIn('Ava', n);
    clickButton(/^Jo/, sheet());

    // The padlock is still on the court, and Jo is inside it beside Ben.
    const pairs = padlocked(n);
    expect(pairs.some((names) => names.includes('Jo') && names.includes('Ben'))).toBe(true);
    expect(pairs.some((names) => names.includes('Ava'))).toBe(false);
  });

  it('hands the pairing on well enough to survive a reshuffle', () => {
    seedLinked();
    subIn('Ava', roundWithPair());
    clickButton(/^Jo/, sheet());

    reshuffle();

    // Every round from here on has Jo and Ben on the same team, or neither of
    // them on a court at all. That is what a linked pair means.
    for (const round of storedSchedule().rounds) {
      const together = round.courts.some((c) =>
        [c.team1, c.team2].some(
          (t) => t.some((p) => p.name === 'Jo') && t.some((p) => p.name === 'Ben')
        )
      );
      const playing = onCourt(round);
      if (playing.includes('Jo') || playing.includes('Ben')) expect(together).toBe(true);
    }
  });

  it('leaves the couple in Setup alone when it is stood in for', () => {
    seedLinked();
    subIn('Ava', roundWithPair());
    clickButton(/^Jo/, sheet());

    // Ava is off for the afternoon, not divorced. Standing in used to delete the
    // couple from storage outright, so she came back the following week with no
    // partner and nothing on screen to say why.
    expect(JSON.parse(window.localStorage.getItem('pb-partnerships') ?? '[]')).toEqual([
      { player1Id: 'p1', player2Id: 'p2' },
    ]);
  });

  /** What the app is holding about who is covering for whom. */
  function standIns(): { player1Id: string; player2Id: string }[] {
    return JSON.parse(window.localStorage.getItem('pb-sub-partnerships') ?? '[]');
  }


  it('lets the partner left behind be linked to somebody else', () => {
    seedLinked();
    subIn('Ava', roundWithPair());
    clickButton(/^Jo/, sheet());

    // Ava's couple with Ben is still in storage, with Ava not in the session.
    // Set Partners lists Ben as free to pair, because his partner is not here —
    // so a tap on him has to do something. It used to refuse in silence.
    //
    // The sub is work on the schedule, so the tab asks on the way out. The
    // couples are Setup's and survive the abandon, which is the point here.
    leaveSchedule(/^2\. Setup$/);
    clickButton(/^Set Partners$/);
    clickButton(/^Ben/);
    clickButton(/^Cara/);
    clickButton(/^Done Pairing$/);

    const stored = JSON.parse(window.localStorage.getItem('pb-partnerships') ?? '[]');
    expect(stored).toEqual([{ player1Id: 'p2', player2Id: 'p3' }]);
  });

  it('forgets who was covering for whom when a new schedule is built', () => {
    seedLinked();
    subIn('Ava', roundWithPair());
    clickButton(/^Jo/, sheet());
    expect(standIns()).toHaveLength(1);

    // A fresh schedule is a fresh afternoon. Nobody is standing in for anybody
    // in a session that has not started, and the question is asked at the tab
    // on the way out rather than over the button that builds.
    leaveSchedule(/^2\. Setup$/);
    expect(standIns()).toEqual([]);

    clickButton(/^Generate Schedule/);
    expect(standIns()).toEqual([]);
  });

  it('forgets a stand-in who goes home themselves', () => {
    seedLinked();
    subIn('Ava', roundWithPair());
    clickButton(/^Jo/, sheet());
    expect(standIns()).toHaveLength(1);

    // Jo came on for Ava and inherited Ben. Now Jo goes home too, which breaks
    // it — so if she comes back later she arrives linked to nobody, the same as
    // anybody else who has been removed.
    const round = storedSchedule().rounds.find((r) => onCourt(r).includes('Jo'))!;
    takeOff('Jo', round.roundNumber);

    expect(standIns()).toEqual([]);
  });

  it('takes its pencil away when somebody is removed from the grid', () => {
    seedLinked();
    // Anybody not held by a padlock, so this is about the tap rather than about
    // the couple: an ordinary selection shows a pencil the same way.
    const tapped = storedSchedule().rounds[0].courts[0].team2[0].name;
    click(seat(tapped, 1));
    expect(pencil(tapped, 1)).not.toBeNull();

    // Removing anybody rebuilds every round still to be played, and a selection
    // is a place rather than a person. Left standing, the pencil reappears on
    // whoever the rebuild put in that place, and opens their panel.
    action(/^Remove Player$/);
    clickButton(/^Cara/, sheet());
    clickButton(/^Remove$/, sheet());

    for (const round of storedSchedule().rounds) {
      expect(roundCard(round.roundNumber).querySelector('[aria-label^="Edit "]')).toBeNull();
    }
  });

  it('breaks its padlock when the player goes home', () => {
    seedLinked();
    takeOff('Ava', roundWithPair());

    // Nothing on the schedule is padlocked any more: the only couple there was
    // has lost a member, and Ben is free to be moved like anybody else.
    for (const round of storedSchedule().rounds) {
      expect(padlocked(round.roundNumber)).toEqual([]);
    }
  });

  it('frees the partner left behind to be swapped', () => {
    seedLinked();
    takeOff('Ava', roundWithPair());

    const round = storedSchedule().rounds.find((r) => onCourt(r).includes('Ben'))!;
    click(seat('Ben', round.roundNumber));

    // A selected seat, not a locked one showing a pencil.
    expect(seat('Ben', round.roundNumber).className).toContain('ring-blue-500');
  });
});

/**
 * The padlock a host clicks on between two players who are not a couple.
 *
 * It is the other kind of lock, and it names two people and a place. Both halves
 * can come apart underneath it, and when they do the scheduler is handed a
 * player who is not in the room — which it answers with a round that has no
 * courts on it and everybody sitting out.
 */
describe('a padlock clicked on by hand', () => {
  beforeEach(() => seed(10, 9, 2));

  /** Locks the first pair on Round 1 and returns their two names. */
  function lockFirstPair(): string[] {
    const card = roundCard(1);
    const lock = card.querySelector('[aria-label="Lock pair"]') as HTMLElement;
    const column = lock.parentElement as HTMLElement;
    const names = [...column.children]
      .filter((el) => el !== lock && el.tagName === 'BUTTON')
      .map((el) => NAMES.find((n) => text(el).startsWith(n)) ?? '?');
    click(lock);
    return names;
  }

  function padlockedNames(round = 1): string[] {
    return [...roundCard(round).querySelectorAll('[aria-label="Unlock pair"]')].flatMap((lock) => {
      const column = lock.parentElement as HTMLElement;
      return [...column.children]
        .filter((el) => el !== lock && el.tagName === 'BUTTON')
        .map((el) => NAMES.find((n) => text(el).startsWith(n)) ?? '?');
    });
  }

  it('follows the seat when somebody stands in', () => {
    mount();
    generate();
    const [first, second] = lockFirstPair();

    subIn(first, 1);
    clickButton(/^Jo/, sheet());

    const names = padlockedNames(1);
    expect(names).toContain('Jo');
    expect(names).toContain(second);
    expect(names).not.toContain(first);
  });

  it('leaves the rounds playable after a reshuffle that follows a removal', () => {
    mount();
    generate();
    const [first] = lockFirstPair();

    takeOff(first, 1);
    reshuffle();

    // Eight players and two courts: everybody plays every round, nobody sits.
    // A padlock still naming the player who went home makes the scheduler throw
    // away every attempt it makes at that round, and what comes back is one
    // court with four people on it and the other five stood on the side.
    for (const round of storedSchedule().rounds) {
      expect(round.courts, `round ${round.roundNumber}`).toHaveLength(2);
      expect(round.sitOuts, `round ${round.roundNumber}`).toHaveLength(0);
    }
  });

  it('never lands on a pair the host did not lock', () => {
    mount();
    generate();
    const [first, second] = lockFirstPair();

    takeOff(first, 1);

    // Removing somebody rebuilds every round still to be played, so the court
    // and side the padlock was drawn from now hold two entirely different
    // people. The only padlock there was named the player who has gone, so
    // there is no padlock left to draw: not around the pair it named, and not
    // around whoever the rebuild stood in their place.
    expect(second).not.toBe(first);
    for (const round of storedSchedule().rounds) {
      expect(padlockedNames(round.roundNumber), `round ${round.roundNumber}`).toEqual([]);
    }
  });
});

/**
 * The orange line that says a new version is out.
 *
 * A build used to be let in on its own — in the background, or just after a
 * return from a long enough absence — and between those two the banner was
 * almost never on screen when anybody was looking at it. Reload is the only way
 * through now, so the line has to actually reach somebody, and it has to still
 * be reachable after they have waved it away once.
 */
describe('the new version banner', () => {
  const LINE = 'New version ready';

  function shown(): boolean {
    return (container.textContent ?? '').includes(LINE);
  }

  /** The app going into a pocket and coming back out of it. */
  function pickUpAgain() {
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  beforeEach(() => {
    swUpdate.set('none');
    swUpdate.applied.count = 0;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    seed(9, 9, 2);
  });

  it('says nothing while there is no new build', () => {
    mount();
    expect(shown()).toBe(false);
  });

  it('appears the moment a build is ready, without a reload to find out', () => {
    mount();
    expect(shown()).toBe(false);

    act(() => swUpdate.set('ready'));

    expect(shown()).toBe(true);
  });

  it('reloads onto the new build when the button is pressed', () => {
    mount();
    act(() => swUpdate.set('ready'));

    clickButton(/^Reload$/);

    // The only way in there is now, which is the whole point of the line.
    expect(swUpdate.applied.count).toBe(1);
  });

  it('goes away when it is waved off', () => {
    mount();
    act(() => swUpdate.set('ready'));
    clickLabel('Not now');

    expect(shown()).toBe(false);
    expect(swUpdate.applied.count).toBe(0);
  });

  /**
   * The half that matters now that nothing lets a build in on its own. A
   * refusal that stuck would be somebody on last month's build having tapped
   * one small cross once, with nothing left to ask them again.
   */
  it('comes back the next time the app is picked up', () => {
    mount();
    act(() => swUpdate.set('ready'));
    clickLabel('Not now');
    expect(shown()).toBe(false);

    pickUpAgain();

    expect(shown()).toBe(true);
  });

  it('stays away while they are still using the app', () => {
    mount();
    act(() => swUpdate.set('ready'));
    clickLabel('Not now');

    // The tab never went anywhere. Walking around the app is not picking it
    // up again, and the line must not spring back under somebody mid-round.
    clickButton(/^Continue to Setup/);
    clickButton(/^1\. Players$/);

    expect(shown()).toBe(false);
  });
});
