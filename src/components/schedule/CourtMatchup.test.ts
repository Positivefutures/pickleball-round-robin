/**
 * @vitest-environment happy-dom
 *
 * A long name must be shown whole, and must not change the shape of a court.
 *
 * It used to be cut with an ellipsis. That kept every court the same height and
 * lost the end of the name, which is the half that says which of two Vanessas
 * this is — reported off a live session where both read "Vanessa…". So it wraps
 * now, and the shape is held a different way.
 *
 * happy-dom has no layout, so what is checked here is the arrangement that
 * produces the behaviour rather than the pixels. Four parts hold it together:
 * the name wraps rather than clipping, the span and the seat around it are both
 * allowed to be narrower than the name, the two teams share row lines so a wrap
 * on one side cannot put them out of step, and the rating never gives up width.
 * Any one of them missing and the name is cut again or the court overflows.
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
  extra: { showScore?: boolean; readOnly?: boolean; showGender?: boolean } = {}
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
        onOpenPlayerMenu: () => {},
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
  it('wraps rather than being cut with an ellipsis', () => {
    const classes = nameSpan().className.split(/\s+/);
    expect(classes).toContain('break-words');
    expect(classes).not.toContain('truncate');
  });

  it('is allowed to be narrower than the name it holds', () => {
    // Without min-w-0 the span keeps its full text width and pushes the court
    // out sideways instead of wrapping inside it.
    expect(nameSpan().className.split(/\s+/)).toContain('min-w-0');
  });

  it('sits in a seat that is also allowed to shrink', () => {
    // The same rule one level up, and the one break-words actually needs:
    // `overflow-wrap: break-word` does not shrink an element's min-content
    // width, so without this the seat stays as wide as the longest word and the
    // name spills out of the card.
    const seat = nameSpan().closest('button');
    expect(seat).not.toBeNull();
    expect(seat!.className.split(/\s+/)).toContain('min-w-0');
  });

  it('puts the two teams on shared row lines', () => {
    // What replaces the ellipsis as the thing keeping a court in shape. Each
    // side is a subgrid of the court's rows, so a name that wraps makes that
    // row taller on both sides at once instead of only its own.
    const seat = nameSpan().closest('button')!;
    const column = seat.parentElement!;
    expect(column.className.split(/\s+/)).toContain('grid-rows-subgrid');
    expect(column.parentElement!.className.split(/\s+/)).toContain('grid');
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

  it('sits on the middle of the card, so its colon is over the Vs. below', () => {
    // The heading and the balance badge take half of what is left each. Given
    // the whole row, the board would centre itself between two things of
    // different widths, which is the middle of nothing. happy-dom has no layout
    // to measure, so what is pinned here is the arrangement that produces it.
    const wrapper = scoreboard(render(scoredCourt, { showScore: true }))!.parentElement!;
    const [left, middle, right] = [...wrapper.parentElement!.children];
    expect(middle).toBe(wrapper);
    expect(wrapper.className.split(/\s+/)).toContain('shrink-0');
    expect(left.className.split(/\s+/)).toContain('flex-1');
    expect(right.className.split(/\s+/)).toContain('flex-1');
  });
});

/**
 * Who is a man and who is a woman, on the rounds where that is the format.
 *
 * A Gendered round and a Mixed round are both built out of it, and until now the
 * card gave no sign of it: the host had to know the roster to see whether what
 * was drawn was what was asked for. On every other round it would be a mark on
 * every name meaning nothing, which is why it is a prop and not a default.
 */
describe('the gender marks', () => {
  /** The mark beside one name, found by what it says about them. */
  const mark = (el: HTMLElement, said: string) =>
    [...el.querySelectorAll('span[title]')].find((s) => s.getAttribute('title') === said);

  it('are absent on an ordinary round', () => {
    expect(render(court).querySelectorAll('svg[viewBox="0 0 50 50"]')).toHaveLength(0);
  });

  it('mark each player on a round whose format is made of it', () => {
    // Ben and Dan are the women of this four, Cara and the long name the men.
    const el = render(court, { showGender: true });
    expect(mark(el, `${LONG} is a man`)).toBeDefined();
    expect(mark(el, 'Ben is a woman')).toBeDefined();
    expect(mark(el, 'Cara is a man')).toBeDefined();
    expect(mark(el, 'Dan is a woman')).toBeDefined();
  });

  it('draw the right symbol for each', () => {
    // The two arrived on different grids, which is the cheapest way to tell
    // them apart without reading the path back.
    const el = render(court, { showGender: true });
    expect(el.querySelectorAll('svg[viewBox="0 0 50 50"]')).toHaveLength(2);
    expect(el.querySelectorAll('svg[viewBox="0 0 512 512"]')).toHaveLength(2);
  });

  it('never take the width from the name they sit beside', () => {
    // Hung on the left edge of the place instead of standing in the row, which
    // is the only arrangement that costs the name nothing. A mark in the flow
    // shortens every name on the two formats that most need to be read.
    const el = render(court, { showGender: true });
    expect(mark(el, 'Ben is a woman')!.className.split(/\s+/)).toContain('absolute');

    // Same name cell either way, down to the class list: nothing was nudged
    // over to make room for the mark.
    const nameCell = (root: HTMLElement) =>
      [...root.querySelectorAll('span[title]')].find((s) => s.getAttribute('title') === 'Ben')!;
    expect(nameCell(el).className).toBe(nameCell(render(court)).className);
  });

  it('are kept off the printed sheet', () => {
    // Paper is read out at the net, where the round's own heading has already
    // said which format is being played.
    const el = render(court, { showGender: true });
    expect(mark(el, 'Ben is a woman')!.className.split(/\s+/)).toContain('no-print');
  });
});
