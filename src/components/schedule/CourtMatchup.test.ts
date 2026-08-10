/**
 * @vitest-environment happy-dom
 *
 * A long name must not be allowed to change the shape of a court.
 *
 * Left alone it did two things, and the second is the worse one. It wrapped, so
 * that court stood taller than the one beside it and a grid meant to be scanned
 * stopped lining up. And because a flex item will not go narrower than its own
 * contents unless told to, the court grew sideways off the edge of the phone
 * instead.
 *
 * happy-dom has no layout, so what is checked here is the arrangement that
 * produces the behaviour rather than the pixels. Three parts have to hold
 * together: the name shrinks and clips, the column it sits in is allowed to be
 * narrower than the name, and the rating on the other end never gives up any
 * width. Any one of them missing and the name wraps or the court overflows.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CourtAssignment, Player } from '../../types';
import { CourtMatchup } from './CourtMatchup';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LONG = 'Bartholomew Fitzwilliam-Smythe';

const players: Player[] = [LONG, 'Ben', 'Cara', 'Dan'].map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 3.5 + i * 0.25,
  gender: i % 2 === 0 ? 'M' : 'F',
  rosterIds: ['g1'],
}));

const court: CourtAssignment = {
  courtNumber: 1,
  team1: [players[0], players[1]],
  team2: [players[2], players[3]],
  ratingDiff: 0,
};

let root: Root;
let container: HTMLElement;

function render(): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(CourtMatchup, {
        court,
        roundIdx: 0,
        courtIdx: 0,
        selectedSlot: null,
        onPlayerTap: () => {},
        allPlayers: players,
        lockedTeams: { team1: false, team2: false },
        onToggleLock: () => {},
        onRequestRemove: () => {},
      })
    );
  });
  return container;
}

/** The element holding the long name. */
function nameSpan(): HTMLElement {
  const found = [...render().querySelectorAll('span')].find((s) => s.textContent === LONG);
  if (!found) throw new Error('the long name was not rendered at all');
  return found;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('a name too long for its court', () => {
  it('is cut with an ellipsis rather than wrapped', () => {
    expect(nameSpan().className.split(/\s+/)).toContain('truncate');
  });

  it('is allowed to be narrower than the name it holds', () => {
    // truncate on its own does nothing here. Without min-w-0 the span keeps its
    // full text width and pushes the court out sideways instead of clipping.
    expect(nameSpan().className.split(/\s+/)).toContain('min-w-0');
  });

  it('sits in a column that is also allowed to shrink', () => {
    // The same rule one level up. The column is a flex item too, and it refuses
    // to go below its content width until it is told it may.
    const column = nameSpan().closest('div.flex-1');
    expect(column).not.toBeNull();
    expect(column!.className.split(/\s+/)).toContain('min-w-0');
  });

  it('never takes the width from the rating beside it', () => {
    const rating = [...render().querySelectorAll('span')].find((s) => s.textContent === '3.5');
    expect(rating).toBeDefined();
    expect(rating!.className.split(/\s+/)).toContain('shrink-0');
  });

  it('keeps the whole name where it can still be read', () => {
    // Cutting it off is a display choice, not a place to lose information.
    expect(nameSpan().getAttribute('title')).toBe(LONG);
  });
});
