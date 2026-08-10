/**
 * @vitest-environment happy-dom
 *
 * The scaffolding the print stylesheet leans on.
 *
 * None of this shows on screen, and a printer is the only place it is ever
 * seen, so a wrong class name here is a fault nobody meets until they are
 * standing at a court with a sheet in their hand. The rules in index.css are
 * written against these exact hooks: the table whose head and foot reserve a
 * band on every page, and the fixed footer painted into the bottom one.
 *
 * What the sheet says is `schedulePdf.parity.test.ts`. This is only its shape.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Player, Schedule } from '../../types';
import { PrintSchedule } from './PrintSchedule';
import { APP_URL } from '../../lib/appInfo';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const players: Player[] = ['Ava', 'Ben', 'Cara', 'Dan', 'Eve'].map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 3.5,
  gender: i % 2 === 0 ? 'M' : 'F',
  rosterIds: ['g1'],
}));

const schedule: Schedule = {
  rounds: [
    {
      roundNumber: 1,
      courts: [
        {
          courtNumber: 1,
          team1: [players[0], players[1]],
          team2: [players[2], players[3]],
          ratingDiff: 0,
        },
      ],
      sitOuts: [players[4]],
    },
  ],
};

let root: Root;
let container: HTMLElement;

function render(s: Schedule | null = schedule): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(PrintSchedule, { schedule: s, players }));
  });
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the printed sheet', () => {
  it('reserves a band on every page with a table head and foot', () => {
    // Padding cannot do this. Vertical padding lands on the first and last page
    // only, so page two would start hard against the edge of the paper.
    const sheet = render().querySelector('.print-sheet')!;
    expect(sheet.tagName).toBe('TABLE');
    expect(sheet.querySelector('thead .print-band-top')).not.toBeNull();
    expect(sheet.querySelector('tfoot .print-band-bottom')).not.toBeNull();
  });

  it('keeps the rounds in the body, between the two bands', () => {
    // In the thead they would repeat on every page.
    const sheet = render().querySelector('.print-sheet')!;
    expect(sheet.querySelector('tbody .round-card')).not.toBeNull();
    expect(sheet.querySelector('thead .round-card')).toBeNull();
    expect(sheet.querySelector('tfoot .round-card')).toBeNull();
  });

  it('names the app address in the footer, taken from APP_URL', () => {
    const footer = render().querySelector('.print-footer')!;
    expect(footer.textContent).toBe(new URL(APP_URL).host);
  });

  it('puts the footer outside the sheet, so it is not counted as content', () => {
    const root = render();
    expect(root.querySelector('.print-sheet .print-footer')).toBeNull();
    expect(root.querySelector('.print-footer')).not.toBeNull();
  });

  it('shows the logo, and gives it no alt text of its own', () => {
    // The title is right beside it and says the same thing, so a screen reader
    // announcing both would say it twice.
    const logo = render().querySelector('img')!;
    expect(logo.getAttribute('src')).toBe('/logo.png');
    expect(logo.getAttribute('alt')).toBe('');
  });

  it('sets the player names in bold', () => {
    const cell = [...render().querySelectorAll('td')].find((td) => td.textContent === 'Ava & Ben')!;
    expect(cell.style.fontWeight).toBe('bold');
  });

  it('sets the sit-out line at the size of the names', () => {
    const root = render();
    const names = [...root.querySelectorAll('td')].find((td) => td.textContent === 'Ava & Ben')!;
    const sitOut = [...root.querySelectorAll('p')].find((p) =>
      (p.textContent ?? '').startsWith('Sitting out')
    )!;
    expect(sitOut.style.fontSize).toBe(names.style.fontSize);
  });

  it('puts the round and court labels in capitals', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('ROUND 1');
    expect(text).toContain('COURT 1');
  });

  it('calls each court what the host called it, not where it sits', () => {
    // The host renames a court because the centre gave them court 7. The sheet
    // they hand out has to agree with what is called across the hall.
    const named: Schedule = {
      rounds: [{ ...schedule.rounds[0], courts: [{ ...schedule.rounds[0].courts[0], courtNumber: 7 }] }],
    };
    const text = render(named).textContent ?? '';
    expect(text).toContain('COURT 7');
    expect(text).not.toContain('COURT 1');
  });

  it('draws nothing at all without a schedule', () => {
    expect(render(null).innerHTML).toBe('');
  });
});
