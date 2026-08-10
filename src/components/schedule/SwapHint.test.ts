/**
 * @vitest-environment happy-dom
 *
 * The line telling you how to swap two players.
 *
 * It was a grey sentence pinned to the top of the schedule that nothing could
 * remove, on every session for the rest of time. It is worth reading once. So
 * it is a banner now, in the same green as the install offer, and closing it is
 * the end of it.
 *
 * The real SchedulePage is mounted, because half of what has to hold is where
 * the banner sits and when the page decides not to draw it at all.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Player, Round, Schedule } from '../../types';
import { SchedulePage } from './SchedulePage';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const players: Player[] = ['Ava', 'Ben', 'Cara', 'Dan'].map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 3.5,
  gender: i % 2 === 0 ? 'M' : 'F',
  rosterIds: ['g1'],
}));

function rounds(): Round[] {
  return [1, 2].map((roundNumber) => ({
    roundNumber,
    courts: [
      {
        courtNumber: 1,
        team1: [players[0], players[1]],
        team2: [players[2], players[3]],
        ratingDiff: 0,
      },
    ],
    sitOuts: [],
  }));
}

let root: Root;
let container: HTMLElement;
const onDismissSwapHint = vi.fn();

function render(
  { showSwapHint = true, completedRounds = [] as number[] } = {}
): HTMLElement {
  onDismissSwapHint.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const schedule: Schedule = { rounds: rounds() };
  act(() => {
    root.render(
      createElement(SchedulePage, {
        schedule,
        players,
        partnerships: [],
        numCourts: 1,
        completedRounds,
        canUncomplete: true,
        scheduleEdited: false,
        onRegenerate: () => {},
        onUpdateSchedule: () => {},
        onCompletedRoundsChange: () => {},
        onRemovePlayer: () => {},
        onStartNewSession: () => {},
        onUnsavedWorkChange: () => {},
        showSwapHint,
        onDismissSwapHint,
        addablePlayers: [],
        onAddPlayer: () => {},
      })
    );
  });
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function text(el: Element): string {
  return (el.textContent ?? '').trim();
}

/** The banner, wherever it is on the page. */
function hint(): HTMLElement | null {
  const found = [...container.querySelectorAll('div')].find((d) =>
    text(d).startsWith('Tap a player, then tap another to swap them')
  );
  return (found as HTMLElement) ?? null;
}

function shown(): HTMLElement {
  const found = hint();
  if (!found) throw new Error('the swap hint is not on the page');
  return found;
}

describe('the swap hint', () => {
  it('is drawn as a green alert rather than a grey line', () => {
    render();
    const classes = shown().className.split(/\s+/);
    expect(classes).toContain('bg-green-50');
    expect(classes).toContain('border-green-200');
    // It was text-gray-400 before, which is what made it read as furniture.
    expect(classes.some((c) => c.startsWith('text-gray'))).toBe(false);
  });

  it('opens with the bulb, and reads a size up from the courts under it', () => {
    // The bulb is what makes this scan as a tip in the half-second it gets. The
    // sentence used to be text-sm, the same as a name on a court, which is the
    // size for something you read all afternoon rather than once.
    render();
    const banner = shown();
    expect(banner.querySelector('svg[viewBox="0 0 60 60"]')).not.toBeNull();
    const line = [...banner.querySelectorAll('p')].find((p) =>
      text(p).startsWith('Tap a player')
    )!;
    expect(line.className.split(/\s+/)).toContain('text-base');
  });

  it('announces itself without stealing the focus', () => {
    // It appears on arrival rather than in answer to anything, so a screen
    // reader should mention it and then leave the host where they were.
    render();
    expect(shown().getAttribute('role')).toBe('status');
  });

  it('can be waved away', () => {
    render();
    const close = shown().querySelector('button[aria-label="Dismiss"]');
    expect(close).not.toBeNull();
    act(() => (close as HTMLElement).click());
    expect(onDismissSwapHint).toHaveBeenCalledTimes(1);
  });

  it('stays away once it has been waved away', () => {
    // The whole complaint: it was a permanent fixture. What makes the dismissal
    // outlive the session is the store behind this flag, which App.walkthrough
    // proves across a relaunch.
    render({ showSwapHint: false });
    expect(hint()).toBeNull();
  });

  it('says nothing once every round has been played', () => {
    // Completed rounds are frozen, so there is nothing left to swap.
    render({ completedRounds: [1, 2] });
    expect(hint()).toBeNull();
  });

  it('sits above the rounds, where it is read before the schedule', () => {
    render();
    const first = container.querySelector('.round-card')!;
    expect(shown().compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});
