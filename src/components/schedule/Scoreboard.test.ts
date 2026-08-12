/**
 * @vitest-environment happy-dom
 *
 * The board on a court, and the box that fills it in.
 *
 * happy-dom has no layout, so what is checked here is the arrangement that
 * produces the behaviour rather than the pixels — the same reasoning as
 * CourtMatchup.test.ts. Two things in particular cannot be seen from a
 * screenshot and would be silently lost by a refactor: that only the panels take
 * a win colour, and that the panels are typed into as text rather than counted.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CourtAssignment, CourtScore, Player } from '../../types';
import { Scoreboard } from './Scoreboard';
import { ScoreDialog } from './ScoreDialog';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const players: Player[] = ['Ava', 'Ben', 'Cara', 'Dan'].map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 4,
  gender: i % 2 === 0 ? 'F' : 'M',
  rosterIds: ['g1'],
}));

function court(score?: CourtScore, team2 = [players[2], players[3]]): CourtAssignment {
  const c: CourtAssignment = {
    courtNumber: 3,
    team1: [players[0], players[1]],
    team2,
    ratingDiff: 0,
  };
  if (score) c.score = score;
  return c;
}

let root: Root;
let container: HTMLElement;

function mount(element: ReturnType<typeof createElement>): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** The two number panels, left then right. */
function panels(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll('span.tabular-nums')] as HTMLElement[];
}

/**
 * What the panels sit in. It carries no border of its own any more, so it is
 * only ever asked what it is not.
 */
const frame = (el: HTMLElement) => el.querySelector('button > span') as HTMLElement;

const classesOf = (el: HTMLElement) => el.className.split(/\s+/);

/** A panel's height in px, from `h-[30px]` or from Tailwind's `h-10` step. */
function heightOf(el: HTMLElement): number {
  const cls = classesOf(el).find((c) => /^h-/.test(c));
  if (!cls) throw new Error('the panel has no height');
  const exact = cls.match(/^h-\[(\d+)px\]$/);
  return exact ? Number(exact[1]) : Number(cls.slice(2)) * 4;
}

const minWidthOf = (el: HTMLElement) => classesOf(el).find((c) => c.startsWith('min-w-['));

/** The number's own size in rem, which is always written out in full. */
function fontRemOf(el: HTMLElement): number {
  const cls = classesOf(el).find((c) => /^text-\[[\d.]+rem\]$/.test(c));
  if (!cls) throw new Error('the panel has no size of its own');
  return Number(cls.match(/[\d.]+/)![0]);
}

function board(score?: CourtScore, onTap = () => {}): HTMLElement {
  return mount(
    createElement(Scoreboard, { score, courtNumber: 3, onTap })
  );
}

describe('a court nobody has scored', () => {
  it('shows a waiting dash on each side rather than a nought', () => {
    // A nought is a score somebody could mean. This has to read as empty.
    const shown = panels(board()).map((p) => p.textContent);
    expect(shown).toEqual(['–', '–']);
  });

  it('is a button that says it opens something', () => {
    const button = board().querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button!.getAttribute('aria-label')).toBe('Enter the score for court 3');
  });

  it('keeps its panels at full strength, so it reads as waiting and not disabled', () => {
    for (const panel of panels(board())) {
      expect(classesOf(panel)).toContain('border-gray-800');
    }
  });

  it('draws no box around the pair', () => {
    // The card is a bordered box and the round is another. A third around two
    // small panels is one too many, so the panels have to carry the drawing.
    const classes = classesOf(frame(board()));
    expect(classes.some((c) => c.startsWith('border'))).toBe(false);
    expect(classes.some((c) => c.startsWith('bg-'))).toBe(false);
  });
});

describe('a scored court', () => {
  it('turns the winning side green and the losing side red', () => {
    const [left, right] = panels(board({ team1: 11, team2: 7 }));
    expect(classesOf(left)).toContain('bg-green-100');
    expect(classesOf(left)).toContain('text-green-800');
    expect(classesOf(right)).toContain('bg-red-100');
    expect(classesOf(right)).toContain('text-red-800');
  });

  it('puts the colours the other way round when the other side wins', () => {
    const [left, right] = panels(board({ team1: 7, team2: 11 }));
    expect(classesOf(left)).toContain('bg-red-100');
    expect(classesOf(right)).toContain('bg-green-100');
  });

  it('gives a level game to neither side, and says so in yellow', () => {
    // Not a pickleball result, but it is a state on the way to typing 11-13,
    // and it must not colour whoever happens to be drawn on the left. Both
    // sides wear the same third colour, so a draw reads as a draw rather than
    // as a board nobody has filled in.
    for (const panel of panels(board({ team1: 11, team2: 11 }))) {
      expect(classesOf(panel)).not.toContain('bg-green-100');
      expect(classesOf(panel)).not.toContain('bg-red-100');
      expect(classesOf(panel)).toContain('bg-yellow-100');
      expect(classesOf(panel)).toContain('border-yellow-700');
      expect(classesOf(panel)).toContain('text-yellow-800');
    }
  });

  it('reads the score out for anyone who cannot see the colours', () => {
    const button = board({ team1: 11, team2: 7 }).querySelector('button');
    expect(button!.getAttribute('aria-label')).toBe(
      'Court 3 score, 11 to 7. Tap to change it.'
    );
  });

  it('holds both panels to one width, so the board does not twitch as a score changes', () => {
    // Without tabular figures "11" is narrower than "21" and the whole board
    // shifts sideways under the host's thumb. The width itself is a design
    // number and moves; that the two share it is the thing that must not.
    const [left, right] = panels(board({ team1: 21, team2: 9 }));
    for (const panel of [left, right]) {
      expect(classesOf(panel)).toContain('tabular-nums');
      expect(minWidthOf(panel)).toBeTruthy();
    }
    expect(minWidthOf(left)).toBe(minWidthOf(right));
  });

  it('rides the court header smaller than the dialog does', () => {
    // The board on a court is a readout beside COURT 3. The one in the box is
    // the thing being typed into, and is still the bigger of the two, now that
    // the small one has been taken up a fifth to be read from where the phone
    // is lying.
    const small = panels(board({ team1: 11, team2: 7 }))[0];
    const big = panels(dialog())[0];

    expect(heightOf(small)).toBeLessThan(heightOf(big));
    expect(classesOf(small)).toContain('border-2');
  });

  /**
   * A score is read across a court, not held up to the face. It has to beat the
   * body text around it, which the 0.9375rem it was drawn at did not.
   */
  it('sets the number larger than the text on the card around it', () => {
    const small = panels(board({ team1: 11, team2: 7 }))[0];
    expect(fontRemOf(small)).toBeGreaterThan(1);
  });

  it('keeps a thumb-sized tap target under the small board', () => {
    // 25px of panel is not 44px of reach. The padding makes up the difference
    // and the negative margin keeps it out of the header row's height.
    const button = board().querySelector('button')!;
    const classes = button.className.split(/\s+/);
    expect(classes).toContain('py-2.5');
    expect(classes).toContain('-my-2.5');
  });

  it('draws the colon as two pills the screen reader never sees', () => {
    const hidden = board().querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden!.children).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- the dialog

function dialog(existing?: CourtScore, onDone: (s: CourtScore | null) => void = () => {}) {
  return mount(
    createElement(ScoreDialog, { court: court(existing), onDone, onCancel: () => {} })
  );
}

/**
 * A keypad button, by the face of it. Scoped to the keypad on purpose: once a
 * side reads "1", the panel above it is a button whose text is also "1".
 */
function press(el: HTMLElement, text: string) {
  const keypad = el.querySelector('[aria-label="Score keypad"]');
  if (!keypad) throw new Error('the keypad was not rendered');
  const button = [...keypad.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!button) throw new Error(`no key reading "${text}"`);
  act(() => button.click());
}

/** Rubs out one digit on the side being typed into. */
function backspace(el: HTMLElement) {
  const button = [...el.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === 'Backspace'
  );
  if (!button) throw new Error('no backspace key');
  act(() => button.click());
}

/** Taps a side's panel, which is what moves the typing to it. */
function tapSide(el: HTMLElement, which: 0 | 1) {
  const button = [...el.querySelectorAll('button')].filter((b) =>
    (b.getAttribute('aria-label') ?? '').startsWith('Score for')
  )[which];
  act(() => button.click());
}

function save(el: HTMLElement) {
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Save');
  if (!button) throw new Error('no Save button');
  act(() => button.click());
}

const shown = (el: HTMLElement) => panels(el).map((p) => p.textContent);

describe('writing a score down', () => {
  it('opens on the score already there', () => {
    expect(shown(dialog({ team1: 11, team2: 7 }))).toEqual(['11', '7']);
  });

  it('opens empty on a court nobody has scored', () => {
    expect(shown(dialog())).toEqual(['–', '–']);
  });

  it('builds a number out of digits rather than counting them up', () => {
    // 1 then 1 is eleven. This is the whole reason the sides are held as text.
    const el = dialog();
    press(el, '1');
    press(el, '1');
    expect(shown(el)[0]).toBe('11');
  });

  it('moves to the other side once a full one is typed', () => {
    const el = dialog();
    press(el, '1');
    press(el, '1');
    press(el, '7');
    expect(shown(el)).toEqual(['11', '7']);
  });

  it('refuses a third digit', () => {
    const el = dialog();
    press(el, '9');
    press(el, '9');
    // The side is full and focus has moved on, so this lands on the other one.
    press(el, '5');
    expect(shown(el)).toEqual(['99', '5']);
  });

  it('lays the pad out as the nine, the scores games end on, then the rest', () => {
    // Written out in order because the row is the point: 10, 11 and 12 sit
    // under 7, 8 and 9, where the eye already is. No plus or minus anywhere.
    const faces = [...dialog().querySelector('[aria-label="Score keypad"]')!.children].map(
      (b) => b.textContent
    );
    expect(faces).toEqual([
      '1', '2', '3',
      '4', '5', '6',
      '7', '8', '9',
      '10', '11', '12',
      '⌫', '0', 'Clear'
    ]);
  });

  it('colours the winner while it is still being typed', () => {
    const el = dialog();
    press(el, '1');
    press(el, '1');
    press(el, '7');
    const [left, right] = panels(el);
    expect(classesOf(left)).toContain('bg-green-100');
    expect(classesOf(right)).toContain('bg-red-100');
  });

  it('saves both numbers at once', () => {
    let saved: CourtScore | null | undefined;
    const el = dialog(undefined, (s) => { saved = s; });
    press(el, '1');
    press(el, '1');
    press(el, '7');
    save(el);
    expect(saved).toEqual({ team1: 11, team2: 7 });
  });

  it('will not save half a score', () => {
    const el = dialog();
    press(el, '1');
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
    expect(button.disabled).toBe(true);
  });

  it('writes a finished score in one tap, whichever of the three it was', () => {
    for (const face of ['10', '11', '12']) {
      const el = dialog();
      press(el, face);
      expect(shown(el)[0]).toBe(face);
    }
  });

  it('moves to the other side after 11, the same as typing it', () => {
    const el = dialog();
    press(el, '11');
    press(el, '7');
    expect(shown(el)).toEqual(['11', '7']);
  });

  it('replaces the side it lands on rather than adding to it', () => {
    // 9 then the 11 key is eleven, not 911 cut down to 91.
    const el = dialog({ team1: 9, team2: 7 });
    press(el, '11');
    expect(shown(el)).toEqual(['11', '7']);
  });

  it('empties both sides at once, not just the one being typed into', () => {
    const el = dialog({ team1: 11, team2: 7 });
    tapSide(el, 1);
    press(el, 'Clear');
    expect(shown(el)).toEqual(['–', '–']);
  });

  it('puts the typing back on the first side, so Clear starts the job over', () => {
    const el = dialog({ team1: 11, team2: 7 });
    tapSide(el, 1);
    press(el, 'Clear');
    press(el, '9');
    expect(shown(el)).toEqual(['9', '–']);
  });

  it('takes a score back with Clear and Save', () => {
    // No delete button. Emptying the board and saving it is the way.
    let saved: CourtScore | null | undefined = { team1: 0, team2: 0 };
    const el = dialog({ team1: 11, team2: 7 }, (s) => { saved = s; });
    press(el, 'Clear');
    save(el);
    expect(saved).toBeNull();
  });

  it('still rubs out one digit at a time', () => {
    // Clear is the quick way, not the only one: a mistyped 1 in 11 should not
    // cost the side that was already written down.
    const el = dialog({ team1: 11, team2: 7 });
    backspace(el);
    expect(shown(el)).toEqual(['1', '7']);
  });

  it('names the sides, so the host knows which panel is which', () => {
    expect(dialog().textContent).toContain('Ava & Ben');
    expect(dialog().textContent).toContain('Cara & Dan');
  });

  it('carries the missing place through to a 2v1', () => {
    const el = mount(
      createElement(ScoreDialog, {
        court: court(undefined, [players[2]]),
        onDone: () => {},
        onCancel: () => {},
      })
    );
    expect(el.textContent).toContain('EMPTY');
  });
});
