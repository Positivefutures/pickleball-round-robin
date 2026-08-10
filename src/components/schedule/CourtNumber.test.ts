/**
 * @vitest-environment happy-dom
 *
 * Setting what a court is called.
 *
 * A centre assigns courts 7, 8 and 9, and the app has no way of knowing that,
 * so it called them 1, 2 and 3. Reading out "Jeff and Peter versus Joe and
 * James on Court 1" sends four people to a court somebody else is playing on.
 *
 * The real SchedulePage is mounted rather than the dialog on its own, because
 * what has to hold is the join between the three: the label opens the box, the
 * box saves through the page, and the page paints the change forward without
 * touching a round that has already been played.
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

const players: Player[] = ['Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana'].map(
  (name, i) => ({
    id: `p${i}`,
    name,
    rating: 3.5,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  })
);

/** Four rounds, two courts apiece, numbered the way the generator leaves them. */
function rounds(): Round[] {
  return Array.from({ length: 4 }, (_, r) => ({
    roundNumber: r + 1,
    courts: [0, 1].map((c) => ({
      courtNumber: c + 1,
      team1: [players[c * 4], players[c * 4 + 1]],
      team2: [players[c * 4 + 2], players[c * 4 + 3]],
      ratingDiff: 0,
    })),
    sitOuts: [],
  }));
}

let root: Root;
let container: HTMLElement;
const onUpdateSchedule = vi.fn();

function render(completedRounds: number[] = []): HTMLElement {
  onUpdateSchedule.mockClear();
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
        numCourts: 2,
        completedRounds,
        canUncomplete: true,
        scheduleEdited: false,
        onRegenerate: () => {},
        onBack: () => {},
        onUpdateSchedule,
        onCompletedRoundsChange: () => {},
        onRemovePlayer: () => {},
        onStartNewSession: () => {},
        onUnsavedWorkChange: () => {},
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

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

/** One round's card, found by its heading rather than its position on screen. */
function card(roundNumber: number): HTMLElement {
  const found = [...container.querySelectorAll('.round-card')].find(
    (c) => text(c.querySelector('h3')!) === `Round ${roundNumber}`
  );
  if (!found) throw new Error(`round ${roundNumber} is not on the page`);
  return found as HTMLElement;
}

/** The court headings in one round, in the order they are drawn. */
function labels(roundNumber: number): string[] {
  return [...card(roundNumber).querySelectorAll('h4')].map(text);
}

/** The heading for one court, as the thing that opens the box. */
function courtButton(roundNumber: number, label: string): HTMLElement {
  const found = [...card(roundNumber).querySelectorAll('h4 button')].find(
    (b) => text(b) === label
  );
  if (!found) throw new Error(`no ${label} to tap in round ${roundNumber}`);
  return found as HTMLElement;
}

/** The box, once open. */
function dialog(): HTMLElement {
  const found = [...container.querySelectorAll('.fixed.inset-0')].find((d) =>
    text(d).startsWith('Court Number')
  );
  if (!found) throw new Error('the court number box is not open');
  return found as HTMLElement;
}

function input(): HTMLInputElement {
  return dialog().querySelector('input')!;
}

function button(name: string): HTMLElement {
  const found = [...dialog().querySelectorAll('button')].find((b) => text(b) === name);
  if (!found) throw new Error(`no ${name} button`);
  return found as HTMLElement;
}

function type(value: string) {
  act(() => {
    const el = input();
    // What React listens for. Setting .value alone leaves its state behind.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** What each round in the saved schedule calls its first court. */
function saved(): number[] {
  const last = onUpdateSchedule.mock.calls.at(-1);
  if (!last) throw new Error('nothing was saved');
  return (last[0] as Schedule).rounds.map((r) => r.courts[0].courtNumber);
}

describe('the court heading', () => {
  it('says COURT in capitals, in bold', () => {
    // Written out rather than set in capitals with CSS, so the screen agrees
    // with the printed sheet and the PDF, which have always said COURT.
    render();
    expect(labels(1)).toEqual(['COURT 1', 'COURT 2']);
    expect(card(1).querySelector('h4')!.className.split(/\s+/)).toContain('font-bold');
  });

  it('opens the box when it is tapped', () => {
    render();
    click(courtButton(1, 'COURT 1'));
    expect(text(dialog().querySelector('h2')!)).toBe('Court Number');
    // Drawn in the same card as every other dialog in the app.
    expect(dialog().querySelector('.border-\\[\\#444\\]')).not.toBeNull();
  });

  it('cannot be tapped on a round that has been played', () => {
    // A completed round is a record of what happened, under the name it
    // happened on. The heading is still there, it just does nothing.
    render([1]);
    // A completed round is collapsed, so open it to see its courts at all.
    click([...card(1).querySelectorAll('button')].find((b) => text(b) === 'View')!);
    expect(labels(1)).toEqual(['COURT 1', 'COURT 2']);
    expect(card(1).querySelectorAll('h4 button').length).toBe(0);
    expect(card(2).querySelectorAll('h4 button').length).toBe(2);
  });
});

describe('the box', () => {
  it('opens on the number the court has, selected and ready to type over', () => {
    // The whole job should be a tap, a digit and Done.
    render();
    click(courtButton(2, 'COURT 2'));
    expect(input().value).toBe('2');
    expect(document.activeElement).toBe(input());
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 1]);
  });

  it('says which round the change starts at', () => {
    render();
    click(courtButton(3, 'COURT 1'));
    expect(text(dialog())).toContain('Round 3');
  });

  it('will not save an empty box, or anything that is not a number', () => {
    render();
    click(courtButton(1, 'COURT 1'));
    type('');
    expect((button('Done') as HTMLButtonElement).disabled).toBe(true);
    type('7a');
    expect((button('Done') as HTMLButtonElement).disabled).toBe(true);
    type('7');
    expect((button('Done') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('saving a new number', () => {
  it('changes the round it was done at and every round after it', () => {
    render();
    click(courtButton(3, 'COURT 1'));
    type('7');
    click(button('Done'));
    expect(saved()).toEqual([1, 1, 7, 7]);
  });

  it('is painted over by a change made at an earlier round', () => {
    // Round 3 is set to 7, then round 2 is set to 9. Round 3 follows round 2,
    // because that is the later answer about where the group is playing.
    render();
    click(courtButton(3, 'COURT 1'));
    type('7');
    click(button('Done'));
    expect(saved()).toEqual([1, 1, 7, 7]);

    // The page is handed the schedule it saved, the way App would hand it back.
    act(() => {
      root.render(
        createElement(SchedulePage, {
          schedule: onUpdateSchedule.mock.calls.at(-1)![0] as Schedule,
          players,
          partnerships: [],
          numCourts: 2,
          completedRounds: [],
          canUncomplete: true,
          scheduleEdited: true,
          onRegenerate: () => {},
          onBack: () => {},
          onUpdateSchedule,
          onCompletedRoundsChange: () => {},
          onRemovePlayer: () => {},
          onStartNewSession: () => {},
        onUnsavedWorkChange: () => {},
          addablePlayers: [],
          onAddPlayer: () => {},
        })
      );
    });

    click(courtButton(2, 'COURT 1'));
    type('9');
    click(button('Done'));
    expect(saved()).toEqual([1, 9, 9, 9]);
  });

  it('leaves a completed round alone, even one further down the schedule', () => {
    render([3]);
    click(courtButton(2, 'COURT 1'));
    type('7');
    click(button('Done'));
    expect(saved()).toEqual([1, 7, 1, 7]);
  });

  it('leaves the court beside it where it was', () => {
    render();
    click(courtButton(1, 'COURT 1'));
    type('7');
    click(button('Done'));
    const schedule = onUpdateSchedule.mock.calls.at(-1)![0] as Schedule;
    expect(schedule.rounds.map((r) => r.courts[1].courtNumber)).toEqual([2, 2, 2, 2]);
  });

  it('shuts the box', () => {
    render();
    click(courtButton(1, 'COURT 1'));
    type('7');
    click(button('Done'));
    expect(() => dialog()).toThrow();
  });

  it('saves nothing when the box is cancelled', () => {
    render();
    click(courtButton(1, 'COURT 1'));
    type('7');
    click(button('Cancel'));
    expect(onUpdateSchedule).not.toHaveBeenCalled();
    expect(() => dialog()).toThrow();
  });
});
