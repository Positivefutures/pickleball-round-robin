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
import { ROUND_TYPE_META } from './lib/roundTypes';
import type { Schedule, Round, CourtAssignment } from './types';

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

/** The round card whose heading reads "Round N". */
function roundCard(n: number): HTMLElement {
  const card = [...container.querySelectorAll('.round-card')].find(
    (c) => text(c.querySelector('h3') ?? c) === `Round ${n}`
  );
  if (!card) throw new Error(`no card for Round ${n}`);
  return card as HTMLElement;
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

/** Takes somebody off the rounds still to be played, confirmation and all. */
function takeOff(name: string, round = 1) {
  openPlayerMenu(name, round);
  clickButton(/^Remove from Remaining Rounds$/);
  clickButton(/^Yes$/);
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

function storedPlayers(): { id: string; name: string; rating: number }[] {
  return JSON.parse(window.localStorage.getItem('pb-roster') ?? '[]');
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

    action(/^Add a Player$/);
    expect(text(sheet())).toContain('Who is joining?');
    const offered = buttons(/./, sheet()).map(text);
    expect(offered.filter((t) => t.includes(victim.name))).toHaveLength(1);
  });

  it('offers nobody to add while the whole group is already playing', () => {
    mount();
    generate();

    action(/^Add a Player$/);
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
    action(/^Start New Session$/);
    clickButton(/^Yes, Start New$/, sheet());
    generate();
    expect(container.textContent).not.toContain(HINT);
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
  const LINE = 'A free account keeps them safe';

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
      clickButton(/^Sign in$/);
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
        clickButton(/^Sign in$/);

        await settle();
        expect(container.textContent).not.toContain('That link');
      });
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

    action(/^Add a Player$/);
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
    expect(players).toHaveLength(3);
  });
});

describe('step 6 — every step starts at the top', () => {
  beforeEach(() => seed(9, 9, 2));

  it('scrolls to the top on each step change', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mount();
    scrollTo.mockClear();

    clickButton(/^Continue to Setup/);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    scrollTo.mockClear();
    clickButton(/^Generate Schedule/);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    vi.restoreAllMocks();
  });
});

describe('Special Game Types', () => {
  beforeEach(() => seed(10, 10, 2));

  /** The Yes radio for one of the three types, inside the open panel. */
  /**
   * Switches a type on. A switch, not a pair of radios, so this has to check
   * the state first: clicking one that is already on turns it off.
   */
  function sayYes(type: string) {
    const meta = ROUND_TYPE_META[type as keyof typeof ROUND_TYPE_META];
    if (!meta) throw new Error(`no such round type: ${type}`);
    const sw = container.querySelector(
      `button[role="switch"][aria-label="Play ${meta.title}"]`
    ) as HTMLButtonElement | null;
    if (!sw) throw new Error(`no ${type} switch; panel not open?`);
    if (sw.getAttribute('aria-checked') !== 'true') click(sw);
  }

  /** The reorder arrows carry an aria-label; their text is just an arrow. */
  function move(label: string) {
    const button = container.querySelector(`[aria-label="${label}"]`);
    if (!button) throw new Error(`no button labelled "${label}"`);
    click(button);
  }

  it('runs from the button to a badge on the schedule', () => {
    mount();
    clickButton(/^Continue to Setup/);

    // Nothing chosen yet, so Setup shows the button and no summary.
    expect(container.textContent).toContain('Select Special Game Types');
    expect(container.textContent).not.toContain('Mixed every');

    clickButton(/^Select Special Game Types$/);
    expect(container.textContent).toContain('Equal Skill Games');
    sayYes('mixed');
    clickButton(/^Done$/);

    // Back on Setup, the choice shown as a chip under the button it was made
    // from. Which rounds it lands on is no longer previewed here; the schedule
    // says it per round, which is where it is read.
    expect(container.textContent).toContain('Mixed every 2 rounds');
    expect(container.textContent).not.toContain('rounds 1, 3, 5, 7');
    expect(container.textContent).toContain('Select Special Game Types');

    clickButton(/^Generate Schedule/);
    expect(text(roundCard(1))).toContain('Mixed Round');
    expect(text(roundCard(2))).not.toContain('Mixed Round');
    expect(storedSchedule().rounds[0].roundType).toBe('mixed');
    expect(storedSchedule().rounds[1].roundType).toBeUndefined();
  });

  it('gives round 1 to a type when two are switched on', () => {
    mount();
    clickButton(/^Continue to Setup/);
    clickButton(/^Select Special Game Types$/);
    sayYes('gendered');
    sayYes('mixed');
    clickButton(/^Done$/);

    // Both keep their own frequency, and they take turns from round 1.
    expect(container.textContent).toContain('Gendered every 2 rounds');
    expect(container.textContent).toContain('Mixed every 2 rounds');

    clickButton(/^Generate Schedule/);
    const types = storedSchedule().rounds.map((r) => r.roundType);
    expect(types[0]).toBe('gendered');
    expect(types[1]).toBe('mixed');
    expect(types.filter((t) => t === 'gendered').length).toBeGreaterThan(0);
    expect(types.filter((t) => t === 'mixed').length).toBeGreaterThan(0);
  });

  it('lets the host reorder the types, changing which opens the session', () => {
    mount();
    clickButton(/^Continue to Setup/);
    clickButton(/^Select Special Game Types$/);
    sayYes('gendered');
    sayYes('mixed');
    move('Move Mixed Games up');
    clickButton(/^Done$/);

    clickButton(/^Generate Schedule/);
    const types = storedSchedule().rounds.map((r) => r.roundType);
    expect(types[0]).toBe('mixed');
    expect(types[1]).toBe('gendered');
  });

  // 12 players, six of each gender, on 3 courts. Four men fill one court and
  // four women another; the two men and two women left over cannot make a
  // gendered court, so they play an ordinary game on court 3. Both the schedule
  // and the printout have to say so, or the round looks like it went wrong.
  describe('a court the format cannot fill', () => {
    beforeEach(() => seed(12, 12, 3));

    function printedRound(n: number): string {
      const cards = [...container.querySelectorAll('.print-only .round-card')];
      const card = cards.find((c) => text(c.querySelector('h2') ?? c).startsWith(`ROUND ${n}`));
      if (!card) throw new Error(`no printed card for ROUND ${n}`);
      return text(card);
    }

    it('marks the leftover court on a gendered round, on screen and on paper', () => {
      mount();
      clickButton(/^Continue to Setup/);
      clickButton(/^Select Special Game Types$/);
      sayYes('gendered');
      clickButton(/^Done$/);
      clickButton(/^Generate Schedule/);

      const round1 = storedSchedule().rounds[0];
      expect(round1.roundType).toBe('gendered');
      expect(round1.courts).toHaveLength(3);
      expect(round1.courts.filter((c) => genderCount(c) === 1)).toHaveLength(2);

      const marks = [...roundCard(1).querySelectorAll('span')].filter(
        (s) => text(s) === 'Normal game'
      );
      expect(marks).toHaveLength(1);
      expect(printedRound(1).match(/\(normal game\)/g)).toHaveLength(1);
    });

    it('says nothing when every court is in format', () => {
      mount();
      clickButton(/^Continue to Setup/);
      clickButton(/^Select Special Game Types$/);
      sayYes('mixed'); // six of each gender fills all three mixed courts
      clickButton(/^Done$/);
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[0].roundType).toBe('mixed');
      expect(text(roundCard(1))).not.toContain('Normal game');
      expect(printedRound(1)).not.toContain('normal game');
    });

    it('marks who is on a court, and leaves the bench alone', () => {
      // The mark answers one question: are the four on this court the four the
      // format asked for. Nobody sitting out is on a court, so a mark there
      // answers nothing and only crowds a row that has no room to spare.
      seed(9, 9, 2); // eight playing, one waiting
      mount();
      clickButton(/^Continue to Setup/);
      clickButton(/^Select Special Game Types$/);
      sayYes('gendered');
      clickButton(/^Done$/);
      clickButton(/^Generate Schedule/);

      expect(storedSchedule().rounds[0].roundType).toBe('gendered');
      const benched = storedSchedule().rounds[0].sitOuts;
      expect(benched).toHaveLength(1);

      const marked = (name: string) =>
        [...roundCard(1).querySelectorAll('span[title]')].some((s) =>
          (s.getAttribute('title') ?? '').startsWith(`${name} is a `)
        );

      // Everybody on a court carries one; the one on the bench does not.
      for (const p of storedSchedule().rounds[0].courts.flatMap((c) => [...c.team1, ...c.team2])) {
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

  it('opens a tab only once the host has been through that step', () => {
    mount();
    expect(playersTab().getAttribute('aria-current')).toBe('step');
    expect(setupTab().disabled).toBe(true);
    expect(scheduleTab().disabled).toBe(true);

    clickButton(/^Continue to Setup/);
    expect(setupTab().getAttribute('aria-current')).toBe('step');
    expect(playersTab().disabled).toBe(false);
    expect(scheduleTab().disabled).toBe(true);

    // Back to Players by the tab, and Setup is still a way forward from there.
    click(playersTab());
    expect(container.textContent).toContain('Continue to Setup');
    expect(setupTab().disabled).toBe(false);
    click(setupTab());
    expect(container.textContent).toContain('Generate Schedule');

    clickButton(/^Generate Schedule/);
    expect(playersTab().disabled).toBe(false);
    expect(setupTab().disabled).toBe(false);
    // Generate is the only way onto a schedule, so its tab is never a door.
    expect(scheduleTab().disabled).toBe(true);
  });

  it('goes straight through when the schedule has nothing to lose', () => {
    mount();
    generate();

    click(setupTab());
    expect(container.textContent).not.toContain('Back to Setup?');
    expect(container.textContent).toContain('Generate Schedule');

    clickButton(/^Generate Schedule/);
    click(playersTab());
    expect(container.textContent).not.toContain('Back to Players?');
    expect(container.textContent).toContain('Continue to Setup');
    // Players means starting over, exactly as the New Session button does.
    expect(storedSchedule()).toBeNull();
  });

  it('asks the Setup question before the Setup tab throws work away', () => {
    mount();
    generate();
    markComplete(1);

    click(setupTab());
    expect(container.textContent).toContain('Back to Setup?');

    clickButton(/^Cancel$/);
    expect(container.textContent).toContain('Actions'); // still on the schedule
    expect(completedRounds()).toEqual([1]);

    click(setupTab());
    clickButton(/^Go to Setup$/);
    expect(container.textContent).toContain('Generate Schedule');
  });

  it('asks the Players question before the Players tab throws work away', () => {
    mount();
    generate();
    markComplete(1);

    click(playersTab());
    expect(container.textContent).toContain('Back to Players?');

    clickButton(/^Cancel$/);
    expect(container.textContent).toContain('Actions'); // still on the schedule
    expect(storedSchedule()).not.toBeNull();
    expect(completedRounds()).toEqual([1]);

    click(playersTab());
    clickButton(/^Go to Players$/);
    expect(container.textContent).toContain('Continue to Setup');
    expect(storedSchedule()).toBeNull();
  });

  /**
   * It was a line of body copy in the middle of the box, which read as the
   * first half of the warning under it rather than as the question being asked.
   */
  it('asks the question as a heading, at the size the panels use', () => {
    mount();
    generate();
    // Nothing to lose, nothing to ask: the dialog only opens over real work.
    markComplete(1);
    click(setupTab());

    const heading = container.querySelector('.fixed.inset-0 h2');
    expect(heading).toBeTruthy();
    expect(text(heading!)).toBe('Back to Setup?');
    // The size every other panel in the app heads itself with.
    expect(heading!.className).toContain('text-[1.35rem]');
    expect(heading!.className).toContain('font-extrabold');
  });

  it('leaves Start New Session asking, even with nothing to lose', () => {
    mount();
    generate();

    action(/^Start New Session$/);
    expect(text(sheet())).toContain('Start a new session?');
  });

  // Three doors out of a schedule, three headings, one warning. Pinned here so a
  // future edit to one heading cannot quietly leave the others saying less about
  // the same loss.
  it('warns in the same words whichever door is taken', () => {
    const said = () =>
      text(container).includes(
        "This will discard the current schedule including any swaps you've made " +
          "and rounds you've marked complete."
      );

    mount();
    generate();
    markComplete(1);

    click(setupTab());
    expect(said()).toBe(true);
    clickButton(/^Cancel$/);

    click(playersTab());
    expect(said()).toBe(true);
    clickButton(/^Cancel$/);

    action(/^Start New Session$/);
    expect(said()).toBe(true);
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
    expect(buttons(/^Copy link/, panel)).toHaveLength(1);
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
    action(/^Add a Player$/);
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
 * Reshuffle and Start New Session are covered above, through the same sheet.
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
      'Add a Player', 'Sub a Player', 'Add a Guest',
      'Share Live Session', 'Reshuffle', 'Start New Session',
      'Add a Round', 'Add a Court', 'Remove a Court',
    ]);
  });

  /**
   * Every action's own panel opens the same way: the glyph off its card, large
   * and on the centre line, then the title under it, then the line under that.
   * The grid behind them keeps its own left-aligned heading and has no glyph of
   * its own — it is nine of them.
   */
  it('heads each action panel with its own glyph, centred, above the title', () => {
    // Spare players in the group, so Sub a Player and Add a Guest are live
    // cards rather than disabled ones that swallow the tap.
    seed(12, 8, 2);
    mount();
    generate();

    clickButton(/^Actions$/);
    const header = () => sheet().querySelector('header')!;
    expect(header().querySelector('svg.h-14')).toBeNull();

    for (const label of ['Add a Player', 'Sub a Player', 'Add a Guest', 'Reshuffle']) {
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

    /** Writes a score into the first board on screen, which is round 1. */
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

    action(/^Share Live Session$/);
    expect(text(sheet())).toContain('Accounts are switched off');
    expect(buttons(/^Create an account$/, sheet())).toHaveLength(0);
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

      action(/^Share Live Session$/);
      expect(text(sheet())).toContain('Sharing a session needs an account');

      clickButton(/^Create an account$/, sheet());
      // Waited out, so the sheet is really gone rather than mid-slide. Without
      // this the assertion at the end could be reading the old one.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, SHEET_GONE_MS));
      });
      expect(() => sheet()).toThrow();

      // The panel has to load the Supabase client before it can say whether
      // anyone is signed in, so this is its opening state rather than the sign
      // in form. What matters here is that it opened, and how it closes.
      const hero = container.querySelector('img[src="/account-top.png"]');
      expect(hero).not.toBeNull();
      click(hero!.closest('div')!.parentElement!);

      expect(text(sheet())).toContain('Sharing a session needs an account');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('Add a Court', () => {
    // Twelve over two courts is eight playing and four waiting. A third court
    // is exactly enough for the four of them.
    beforeEach(() => seed(12, 12, 2));

    it('adds it to the unplayed rounds and takes the bench off the bench', () => {
      mount();
      generate();
      markComplete(1);
      const played = fingerprint(storedSchedule().rounds[0]);

      action(/^Add a Court$/);
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

      action(/^Add a Court$/);
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
      action(/^Add a Court$/);
      expect(text(sheet())).toContain('a reshuffle would drop it again');
    });
  });

  describe('Remove a Court', () => {
    beforeEach(() => seed(12, 12, 3));

    it('takes it out of the unplayed rounds and sits its players down', () => {
      mount();
      generate();
      markComplete(1);
      const played = fingerprint(storedSchedule().rounds[0]);
      const losing = storedSchedule().rounds[1].courts[1];
      const displaced = [...losing.team1, ...losing.team2].map((p) => p.name);

      action(/^Remove a Court$/);
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

      action(/^Remove a Court$/);
      expect(text(sheet())).toContain(first);
      expect(text(sheet())).toContain('sit out instead');
    });
  });

  describe('Add a Round', () => {
    beforeEach(() => seed(9, 9, 2));

    it('puts them on the end without touching the ones above', () => {
      mount();
      generate();
      const before = storedSchedule().rounds.map(fingerprint);

      action(/^Add a Round$/);
      clickLabel('More rounds', sheet()); // 1 -> 2
      expect(text(sheet())).toContain('Rounds 9 to 10 are added');
      clickButton(/^Add 2 Rounds$/, sheet());

      const after = storedSchedule();
      expect(after.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(after.rounds.slice(0, 8).map(fingerprint)).toEqual(before);
      expect(window.localStorage.getItem('pb-num-rounds')).toBe('10');

      for (const r of after.rounds.slice(8)) {
        expect(onCourt(r), `Round ${r.roundNumber}`).toHaveLength(8);
      }
    });

    it('is still offered once every round has been played', () => {
      mount();
      generate();
      for (let n = 1; n <= 8; n++) markComplete(n);

      action(/^Add a Round$/);
      clickButton(/^Add 1 Round$/, sheet());
      expect(storedSchedule().rounds).toHaveLength(9);
      expect(completedRounds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe('Sub a Player', () => {
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

      action(/^Sub a Player$/);
      expect(text(sheet())).toContain('Who is coming off?');
      clickButton(new RegExp(`^${going}`), sheet());
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
      action(/^Sub a Player$/);
      clickButton(new RegExp(`^${going}`), sheet());
      clickButton(/^Lex/, sheet());

      expect(window.localStorage.getItem('pb-removed-ids')).toBe('[]');
      expect(checkbox(1).disabled).toBe(false);
    });

    it('offers the player who came off back again', () => {
      mount();
      generate();

      const going = storedSchedule().rounds[0].courts[0].team1[0].name;
      action(/^Sub a Player$/);
      clickButton(new RegExp(`^${going}`), sheet());
      clickButton(/^Lex/, sheet());

      clickButton(/^Actions$/);
      clickButton(/^Add a Player$/, sheet());
      expect(text(sheet())).toContain(going);
    });
  });

  describe('Add a Guest', () => {
    beforeEach(() => seed(9, 9, 2));

    it('plays this session without ever joining the group', () => {
      mount();
      generate();

      action(/^Add a Guest$/);
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
      expect(container.textContent).toContain('Guest');
    });

    it('goes when the session goes', () => {
      mount();
      generate();

      action(/^Add a Guest$/);
      typeInto(nameBox(), 'Sam');
      clickButton(/^Add Guest$/, sheet());
      expect(storedGuests()).toHaveLength(1);

      action(/^Start New Session$/);
      clickButton(/^Yes, Start New$/, sheet());
      expect(storedGuests()).toEqual([]);
    });
  });

  describe('Add a Player', () => {
    beforeEach(() => seed(9, 9, 2));

    it('takes somebody nobody has met into the group and the session', () => {
      mount();
      generate();

      clickButton(/^Actions$/);
      clickButton(/^Add a Player$/, sheet());
      clickButton(/^Someone new$/, sheet());
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

      action(/^Start New Session$/);
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

  it('opens a menu with both things a host can do', () => {
    mount();
    generate();

    openPlayerMenu(onCourtOne().name);
    expect(buttons(/^Edit Player$/)).toHaveLength(1);
    expect(buttons(/^Remove from Remaining Rounds$/)).toHaveLength(1);
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
      // The body is shared with every test in this file, and a lock left on by
      // one of them would make this pass without proving anything.
      document.body.style.position = '';
      mount();
      expect(document.body.style.position).not.toBe('fixed');

      clickButton(/^Manage$/);
      expect(document.body.style.position).toBe('fixed');

      clickButton(/^Done$/);
      expect(document.body.style.position).not.toBe('fixed');
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
