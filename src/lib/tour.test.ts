// @vitest-environment happy-dom
/**
 * The deck itself, as data.
 *
 * Nothing in here mounts anything. The step table is the tour's contract with
 * App and with the overlay — which controls stay alive, which cards refuse to
 * move on their own, what the copy promises — and all of that is checkable
 * without a screen. App.tour.test.ts drives the real thing on top of it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EXAMPLE_ROSTER } from './exampleGroup';
import * as stores from './stores';
import {
  TOUR_COURTS_START,
  TOUR_COURTS_TARGET,
  TOUR_STEPS,
  __tourTesting,
  backCard,
  completeTour,
  getTourView,
  nextCard,
  resumeTour,
  skipTour,
  startTour,
  tourStartSelection,
} from './tour';
import type { Player } from '../types';

/** The Sample Group as the app seeds it, ids included. */
function sampleGroup(): Player[] {
  return EXAMPLE_ROSTER.map((p, i) => ({
    id: `p${i}`,
    name: p.name,
    rating: p.rating,
    gender: p.gender,
    rosterIds: ['r1'],
  })) as Player[];
}

const byName = (players: Player[]) => [...players].sort((a, b) => a.name.localeCompare(b.name));

beforeEach(() => {
  __tourTesting.reset();
  localStorage.clear();
});

describe('tourStartSelection', () => {
  const players = sampleGroup();

  it('leaves four of the fourteen unticked, so Select All has something to do', () => {
    const chosen = tourStartSelection(players);
    expect(players).toHaveLength(14);
    expect(chosen).toHaveLength(10);
  });

  it('takes the 3rd, 6th, 9th and 10th as the list is actually shown', () => {
    // PlayerSelector sorts by name, so these are positions on screen. Sorting
    // any other way here would leave the gaps somewhere the host is not looking.
    const shown = byName(players);
    const chosen = new Set(tourStartSelection(players));
    const missing = shown.filter((p) => !chosen.has(p.id)).map((p) => p.name);

    expect(missing).toEqual(['Beth R.', 'David K.', 'Grace F.', 'Greg H.']);
    expect(shown.filter((_, i) => [2, 5, 8, 9].includes(i)).map((p) => p.name)).toEqual(missing);
  });

  it('spreads the gaps through the list rather than bunching them at one end', () => {
    const shown = byName(players);
    const chosen = new Set(tourStartSelection(players));
    const gaps = shown.map((p, i) => (chosen.has(p.id) ? -1 : i)).filter((i) => i >= 0);

    expect(Math.min(...gaps)).toBeLessThan(shown.length / 3);
    expect(Math.max(...gaps)).toBeGreaterThan(shown.length / 2);
  });

  it('leaves enough ticked to fill three courts with sit-outs to spare', () => {
    // The premise of the whole tour: 3 courts, 12 seats. Ten is short of that
    // and Select All takes them past it, which is what makes the card land.
    expect(tourStartSelection(players).length).toBeLessThan(TOUR_COURTS_TARGET * 4);
    expect(players.length).toBeGreaterThan(TOUR_COURTS_TARGET * 4);
  });
});

describe('the deck', () => {
  it('is eight cards, counted rather than written down', () => {
    expect(TOUR_STEPS).toHaveLength(8);
    startTour();
    expect(getTourView().card!.count).toBe(8);
  });

  it('hides Next on exactly the cards that hand over a real control', () => {
    const handed = TOUR_STEPS.filter((s) => s.hideNext).map((s) => s.id);
    expect(handed).toEqual(['players', 'select-players', 'actions', 'new-round-robin']);
  });

  it('refuses Back only where there is nowhere honest to go', () => {
    // The first card, and the one the host lands on with a schedule they built
    // in between — there is no walking back to before it existed.
    expect(TOUR_STEPS.filter((s) => s.noBack).map((s) => s.id)).toEqual(['players', 'congrats']);
  });

  it('keeps the live step tab undimmed on every single card', () => {
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      startTour();
      for (let n = 0; n < i; n++) nextCard();
      const regions = getTourView().card!.regions;
      const tab = regions.filter((r) => r.anchors.some((a) => a.name === 'active-tab'));

      expect(tab, TOUR_STEPS[i].id).toHaveLength(1);
      expect(tab[0].plain, TOUR_STEPS[i].id).toBe(true);
      expect(tab[0].live, TOUR_STEPS[i].id).toBeFalsy();
    }
  });

  it('never draws a ring round the tab', () => {
    // `plain` is the whole difference between "leave this looking normal" and
    // "look at this". A plain region that also got a ring would be pointing at
    // the tab the host is already on.
    startTour();
    for (const r of getTourView().card!.regions) {
      if (r.plain) expect(r.anchors.every((a) => a.pad === undefined)).toBe(true);
    }
  });

  it('walks the tabs in order and never goes back on itself', () => {
    const order = TOUR_STEPS.map((s) => s.tab);
    expect(order).toEqual([
      'roster', 'setup', 'setup', 'schedule', 'schedule', 'schedule', 'schedule', 'schedule',
    ]);
  });

  it('says the number of players the Sample Group actually has', () => {
    const text = TOUR_STEPS[0].bubbles[0].text;
    expect(text).toContain(String(EXAMPLE_ROSTER.length));
    expect(EXAMPLE_ROSTER).toHaveLength(14);
  });

  it('asks for a court count the tour can actually reach', () => {
    expect(TOUR_COURTS_START).toBeLessThan(TOUR_COURTS_TARGET);
    expect(TOUR_STEPS[1].bubbles[0].text).toContain(String(TOUR_COURTS_TARGET));
  });
});

describe('the state machine', () => {
  it('starts off, with nothing on screen', () => {
    expect(getTourView()).toEqual({ phase: 'off', card: null });
  });

  it('hands back the same object until something changes', () => {
    // useSyncExternalStore compares by identity. A fresh object per call
    // re-renders forever.
    startTour();
    expect(getTourView()).toBe(getTourView());
    const before = getTourView();
    nextCard();
    expect(getTourView()).not.toBe(before);
  });

  it('runs the whole deck without a gap in the middle', () => {
    startTour();
    const seen = [getTourView().card!.id];
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      nextCard();
      expect(getTourView().phase).toBe('card');
      seen.push(getTourView().card!.id);
    }
    expect(seen).toEqual(TOUR_STEPS.map((s) => s.id));
  });

  it('stays on the last card rather than falling off the end', () => {
    startTour();
    for (let i = 0; i < 20; i++) nextCard();
    expect(getTourView().card!.id).toBe('new-round-robin');
  });

  it('walks backwards from the third card to the first', () => {
    startTour();
    nextCard();
    nextCard();
    expect(getTourView().card!.id).toBe('select-players');
    backCard();
    expect(getTourView().card!.id).toBe('courts-rounds');
    backCard();
    expect(getTourView().card!.id).toBe('players');
    backCard();
    expect(getTourView().card!.id).toBe('players');
  });

  it('finishes into the closing sheet, not into nothing', () => {
    startTour();
    completeTour();
    expect(getTourView()).toEqual({ phase: 'complete', card: null });
    expect(stores.tourStage.get()).toBe('done');
    expect(stores.swapHintDismissed.get()).toBe(true);
  });

  it('is over for good once Skip is pressed', () => {
    startTour();
    nextCard();
    skipTour();
    expect(getTourView().phase).toBe('off');
    expect(stores.tourStage.get()).toBe('done');
  });
});

describe('resumeTour', () => {
  it('comes back on the card whose anchors are on the tab that reopened', () => {
    resumeTour('running', 'setup');
    expect(getTourView().card!.id).toBe('courts-rounds');

    resumeTour('running', 'schedule');
    expect(getTourView().card!.id).toBe('congrats');

    resumeTour('running', 'roster');
    expect(getTourView().card!.id).toBe('players');
  });

  it('shows nothing to a device that has finished or never started', () => {
    resumeTour('done', 'roster');
    expect(getTourView().phase).toBe('off');
    resumeTour('none', 'roster');
    expect(getTourView().phase).toBe('off');
  });

  it('treats a stage left by the old two-act tour as finished', () => {
    // 'act1', 'await-schedule' and 'act2' can still be in localStorage on a
    // device that ran the earlier build. Showing somebody a tour they mostly
    // saw is worse than not showing it.
    for (const stale of ['act1', 'await-schedule', 'act2']) {
      resumeTour(stale as never, 'setup');
      expect(getTourView().phase, stale).toBe('off');
    }
  });
});
