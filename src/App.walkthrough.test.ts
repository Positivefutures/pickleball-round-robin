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
import { APP_URL } from './lib/appInfo';
import { sharePayload } from './lib/share';
import type { Schedule, Round, CourtAssignment } from './types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = [
  'Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kit', 'Lex',
];

/** Seeds a group of `inGroup` players with the first `selected` of them attending. */
function seed(inGroup: number, selected: number, courts: number) {
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

    clickButton(/^Reshuffle$/);

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

    // Nobody to add while all nine are in the session.
    expect(buttons(/\+ Add Player/)).toHaveLength(0);

    const victim = storedSchedule().rounds[0].courts[0].team1[0];
    const card = roundCard(1);
    clickButton(new RegExp(`^${victim.name}`), card); // select, revealing the trash icon
    click(card.querySelector(`[aria-label="Remove ${victim.name}"]`)!);
    clickButton(/^Yes$/);

    expect(buttons(/\+ Add Player/).length).toBeGreaterThan(0);
    clickButton(/\+ Add Player/);
    expect(container.textContent).toContain('Add Player to Session');
    const radios = [...container.querySelectorAll('input[type="radio"]')];
    expect(radios).toHaveLength(1);
    expect(text(radios[0].closest('label')!)).toContain(victim.name);
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
    const box = container.querySelector('input[aria-label="Court number"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(box, value);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickButton(/^Done$/, box.closest('form')!);
  }

  it('are kept through a reshuffle, and the played round keeps the one it was played on', () => {
    // A reshuffle throws the unplayed rounds away and builds them again,
    // numbered from 1. The court itself has not moved across the hall.
    mount();
    generate();
    markComplete(1);
    renameCourt(2, 'COURT 1', '7');
    expect(courtNumbers()).toEqual([1, 7, 7, 7, 7, 7, 7, 7]);

    clickButton(/^Reshuffle$/);
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

    // The button sits on the first unplayed round, and only there.
    const adds = buttons(/\+ Add Player/);
    expect(adds).toHaveLength(1);
    expect(roundCard(4).contains(adds[0])).toBe(true);

    click(adds[0]);
    const radio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(text(radio.closest('label')!)).toContain('Jo');
    click(radio);
    clickButton(/^Add Player$/, container.querySelector('.fixed.inset-0')!);

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
    clickButton(/^Reshuffle$/);
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

  it('step 5 — Add Player shows with no "Sitting out" label', () => {
    mount();
    generate();

    expect(storedSchedule().rounds.every((r) => r.sitOuts.length === 0)).toBe(true);
    expect(container.textContent).not.toContain('Sitting out');
    expect(buttons(/\+ Add Player/)).toHaveLength(1);
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
  function sayYes(type: string) {
    const radios = [
      ...container.querySelectorAll(`input[name="special-${type}"]`),
    ] as HTMLInputElement[];
    if (radios.length !== 2) throw new Error(`no ${type} radios; panel not open?`);
    click(radios[1]); // No is first, Yes second
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
    expect(container.textContent).toContain('Equal Skill Level Games');
    sayYes('mixed');
    clickButton(/^Done$/);

    // Back on Setup, read-only, previewing the rounds it will land on.
    expect(container.textContent).toContain('Mixed every 2 rounds');
    expect(container.textContent).toContain('rounds 1, 3, 5, 7');
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
  });
});

describe('the Setup confirmation', () => {
  beforeEach(() => seed(9, 9, 2));

  it('goes straight through on an untouched schedule, and warns once there is work to lose', () => {
    mount();
    generate();

    clickButton(/^← Setup|^&larr; Setup|Setup$/);
    expect(container.textContent).toContain('Generate Schedule'); // no dialog, straight to Setup

    clickButton(/^Generate Schedule/);
    markComplete(1);
    clickButton(/Setup$/);
    expect(container.textContent).toContain('Go back to Setup?');

    clickButton(/^Keep Schedule$/);
    expect(container.textContent).not.toContain('Go back to Setup?');
    expect(completedRounds()).toEqual([1]);

    clickButton(/Setup$/);
    clickButton(/^Go to Setup$/);
    expect(container.textContent).toContain('Generate Schedule');
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
