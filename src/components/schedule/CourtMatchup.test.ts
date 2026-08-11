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

function render(
  which: CourtAssignment = court,
  extra: { showScore?: boolean; readOnly?: boolean } = {}
): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(CourtMatchup, {
        court: which,
        roundIdx: 0,
        courtIdx: 0,
        selectedSlot: null,
        onPlayerTap: () => {},
        allPlayers: players,
        lockedTeams: { team1: false, team2: false },
        onToggleLock: () => {},
        onRequestRemove: () => {},
        onEditScore: () => {},
        ...extra,
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

/**
 * A court the roster could not fill.
 *
 * Fifteen people over four courts leaves three on the last one, and the app
 * plays that rather than turning the fifteenth away. Every court draws four
 * places whatever it managed to fill, and a place going spare says EMPTY and can
 * be tapped like any other — that is how a latecomer gets onto a court.
 */
const threePlayerCourt: CourtAssignment = {
  courtNumber: 4,
  team1: [players[1], players[2]],
  team2: [players[3]],
  ratingDiff: 3.5,
};

const singlesCourt: CourtAssignment = {
  courtNumber: 4,
  team1: [players[1]],
  team2: [players[2]],
  ratingDiff: 0.25,
};

/** Every box on the court that a host could tap. */
function tappable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll('button, [role="button"]')] as HTMLElement[];
}

/** Every EMPTY place drawn on the court, as tappable elements. */
function emptyPlaces(root: HTMLElement): HTMLElement[] {
  return tappable(root).filter((el) => el.textContent === 'EMPTY');
}

function padlocks(root: HTMLElement): HTMLElement[] {
  return tappable(root).filter((el) =>
    (el.getAttribute('aria-label') ?? '').endsWith('pair')
  );
}

describe('a court with three players', () => {
  it('shows the fourth place as EMPTY', () => {
    expect(emptyPlaces(render(threePlayerCourt))).toHaveLength(1);
  });

  it('lets the EMPTY place be tapped, like every other place', () => {
    // This is how somebody sitting out gets onto a court, so it has to be a
    // button and it has to report which court it belongs to.
    const [empty] = emptyPlaces(render(threePlayerCourt));
    expect(empty.tagName).toBe('BUTTON');
    expect(empty.getAttribute('aria-label')).toBe('Empty place on court 4');
  });

  it('offers the padlock on the pair, and only there', () => {
    // Two players on one side are a pair like any other and can be held
    // together. The single has nobody to be held to.
    expect(padlocks(render(threePlayerCourt))).toHaveLength(1);
  });

  it('says nothing about balance', () => {
    // Diff compares one side against the other, and a 2v1 has no comparison
    // worth making — one player covering a whole court is not half a pair.
    expect(render(threePlayerCourt).textContent).not.toContain('Diff');
  });

  it('still lets the three players themselves be tapped for a swap', () => {
    const named = tappable(render(threePlayerCourt)).filter((el) =>
      ['Ben', 'Cara', 'Dan'].some((n) => el.textContent?.startsWith(n))
    );
    expect(named).toHaveLength(3);
  });
});

describe('a court with two players', () => {
  it('draws both spare places, so two latecomers can be tapped in', () => {
    // Left at two boxes there would be no way to grow this court back into a
    // real game short of a reshuffle.
    expect(emptyPlaces(render(singlesCourt))).toHaveLength(2);
  });

  it('offers no padlock, because neither side is a pair', () => {
    expect(padlocks(render(singlesCourt))).toHaveLength(0);
  });

  it('still says how close the two players are', () => {
    // One against one is a comparison that means something, unlike a 2v1.
    expect(render(singlesCourt).textContent).toContain('Diff');
  });
});

/**
 * The scoreboard on a court.
 *
 * Two of these are the reason the feature works at all and neither is visible in
 * a screenshot: the board stays live on a round already marked complete, and a
 * score never touches the colour of the players underneath it.
 */
/**
 * The board, if there is one. Found by its label rather than by aria-haspopup:
 * the court number opens a box too and carries the same attribute.
 */
function scoreboard(root: HTMLElement): HTMLElement | null {
  return (
    [...root.querySelectorAll('button[aria-haspopup="dialog"]')].find((b) =>
      (b.getAttribute('aria-label') ?? '').includes('score')
    ) as HTMLElement | undefined
  ) ?? null;
}

const scoredCourt: CourtAssignment = {
  courtNumber: 1,
  team1: [players[0], players[1]],
  team2: [players[2], players[3]],
  ratingDiff: 0,
  score: { team1: 11, team2: 7 },
};

describe('the scoreboard on a court', () => {
  it('is not drawn at all when the session does not keep score', () => {
    expect(scoreboard(render(court, { showScore: false }))).toBeNull();
  });

  it('is drawn when it does', () => {
    expect(scoreboard(render(court, { showScore: true }))).not.toBeNull();
  });

  it('is still there on a round marked complete', () => {
    // Everything else on this card freezes when the round is done. The board
    // must not: writing the score down afterwards is the ordinary case.
    const el = render(scoredCourt, { showScore: true, readOnly: true });
    expect(scoreboard(el)).not.toBeNull();
    expect(el.textContent).toContain('11');
  });

  it('is not drawn on a court still waiting for players', () => {
    const empty: CourtAssignment = { courtNumber: 9, team1: [], team2: [], ratingDiff: 0 };
    expect(scoreboard(render(empty, { showScore: true }))).toBeNull();
  });

  it('leaves the players their own colours', () => {
    // Only the panels say who won. The chips keep saying which side you are on,
    // and the two colour systems must not be allowed to overwrite each other.
    const el = render(scoredCourt, { showScore: true });
    const chip = (name: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith(name));
    expect(chip('Ben')!.className.split(/\s+/)).toContain('bg-blue-50');
    expect(chip('Cara')!.className.split(/\s+/)).toContain('bg-orange-50');
  });

  it('is kept off the printed sheet', () => {
    // Paper is read out at the net before the games, when there is nothing to
    // write down yet.
    const wrapper = scoreboard(render(court, { showScore: true }))!.parentElement!;
    expect(wrapper.className.split(/\s+/)).toContain('no-print');
  });
});
