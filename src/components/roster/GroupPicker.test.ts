/**
 * @vitest-environment happy-dom
 *
 * Choosing a group, and being told which one you are in.
 *
 * Both halves were the browser's before this: a `<select>` that showed the
 * group in the smallest type on the panel, and a list drawn by the browser
 * itself, no wider than the control and narrow enough to wrap a group name over
 * two lines.
 *
 * The real RosterPage is mounted here rather than the dialog on its own,
 * because the fault was in how the two fit together. happy-dom has no layout,
 * so what is checked is the arrangement rather than the pixels: no native
 * control left to open a browser list, a name set at the size of a heading, and
 * a dialog that is one of ours.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Player, Roster } from '../../types';
import { RosterPage } from './RosterPage';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LONG = 'Wednesday Morning Drop-in Session';

const rosters: Roster[] = [
  { id: 'g1', name: 'Tuesday Crew' },
  { id: 'g2', name: LONG },
];

const allPlayers: Player[] = ['Ava', 'Ben', 'Cara'].map((name, i) => ({
  id: `p${i}`,
  name,
  rating: 3.5,
  gender: i % 2 === 0 ? 'M' : 'F',
  // Ava and Ben are in Tuesday, Cara on her own in the other one.
  rosterIds: i < 2 ? ['g1'] : ['g2'],
}));

let root: Root;
let container: HTMLElement;
const onSelectRoster = vi.fn();

function render(): HTMLElement {
  onSelectRoster.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(RosterPage, {
        allPlayers,
        players: allPlayers.filter((p) => p.rosterIds.includes('g1')),
        rosters,
        activeRosterId: 'g1',
        onSelectRoster,
        onAddRoster: () => {},
        onRenameRoster: () => {},
        onDeleteRoster: () => {},
        onAdd: () => {},
        onUpdate: () => {},
        onAddPlayersToRosters: () => {},
        onRemoveFromRoster: () => {},
        onDeletePlayer: () => {},
        onContinue: () => {},
        defaultRating: 3.5,
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

/** The control on the panel that shows the group you are in. */
function trigger(): HTMLElement {
  const found = [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-haspopup') === 'dialog'
  );
  if (!found) throw new Error('no control opens the group picker');
  return found;
}

/** The name inside that control. */
function triggerName(): HTMLElement {
  const found = [...trigger().querySelectorAll('span')].find(
    (s) => text(s) === 'Tuesday Crew'
  );
  if (!found) throw new Error('the group you are in is not named on the control');
  return found;
}

/** The picker, once open. */
function dialog(): HTMLElement {
  const found = [...container.querySelectorAll('.fixed.inset-0')].find((d) =>
    text(d).startsWith('My Groups')
  );
  if (!found) throw new Error('the group picker is not open');
  return found as HTMLElement;
}

function open(): HTMLElement {
  render();
  click(trigger());
  return dialog();
}

/** The row for one group inside the picker. */
function row(name: string): HTMLElement {
  const found = [...dialog().querySelectorAll('button')].find((b) => text(b).startsWith(name));
  if (!found) throw new Error(`no row for ${name}`);
  return found;
}

describe('the group you are in', () => {
  it('is shown at the size of a name, not in small print', () => {
    // The complaint that started this: it was text-sm, the smallest type on a
    // panel whose whole job is to say which group you are working with.
    //
    // An absolute 1.25rem rather than text-xl, which is the same size until
    // large text mode is switched on and 1.35 times it after. Scaled up it was
    // the biggest thing on the page and read as a heading rather than a
    // setting, so it is held at the one size in both modes.
    render();
    const classes = triggerName().className.split(/\s+/);
    expect(classes).toContain('text-[1.25rem]');
    expect(classes).not.toContain('text-sm');
    expect(classes).not.toContain('text-xl');
  });

  it('is cut with an ellipsis rather than wrapped, and kept whole in the title', () => {
    render();
    expect(triggerName().className.split(/\s+/)).toContain('truncate');
    expect(triggerName().getAttribute('title')).toBe('Tuesday Crew');
  });
});

describe('the picker', () => {
  it('leaves no native dropdown on the page for a browser to draw', () => {
    // A `<select>` anywhere here and the browser opens its own list again,
    // which is the grey box this replaced.
    expect(render().querySelector('select')).toBeNull();
  });

  it('is one of our dialogs, and it is titled', () => {
    const open_ = open();
    const heading = open_.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(text(heading!)).toBe('My Groups');
    // The card every other dialog in the app is drawn in.
    expect(open_.querySelector('.border-\\[\\#444\\]')).not.toBeNull();
  });

  it('lists every group, with the size of each', () => {
    const listed = [...open().querySelectorAll('button')].map(text);
    expect(listed.some((t) => t.startsWith('Tuesday Crew'))).toBe(true);
    expect(listed.some((t) => t.startsWith(LONG))).toBe(true);
    expect(text(row('Tuesday Crew'))).toContain('2 players');
    expect(text(row(LONG))).toContain('1 player');
  });

  it('marks the one you are in, and not by colour alone', () => {
    open();
    expect(row('Tuesday Crew').getAttribute('aria-current')).toBe('true');
    expect(row('Tuesday Crew').querySelector('svg')).not.toBeNull();
    expect(row(LONG).getAttribute('aria-current')).toBeNull();
    expect(row(LONG).querySelector('svg')).toBeNull();
  });

  it('lets a long name wrap, where the control had to cut it', () => {
    // The whole complaint about the browser's list was that a name in it had
    // nowhere to go. Reading the text back proves nothing, since a clipped
    // name is still there in the markup, so what is checked is that this one
    // is not under the rule the control is under.
    open();
    const name = [...row(LONG).querySelectorAll('span')].find((s) => text(s) === LONG);
    expect(name).toBeDefined();
    expect(name!.className.split(/\s+/)).not.toContain('truncate');
    expect(name!.className.split(/\s+/)).toContain('break-words');
  });

  it('switches group on one tap, and shuts', () => {
    open();
    click(row(LONG));
    expect(onSelectRoster).toHaveBeenCalledWith('g2');
    expect(() => dialog()).toThrow();
  });

  it('shuts without switching', () => {
    open();
    const close = [...dialog().querySelectorAll('button')].find((b) => text(b) === 'Close');
    expect(close).toBeDefined();
    click(close!);
    expect(onSelectRoster).not.toHaveBeenCalled();
    expect(() => dialog()).toThrow();
  });
});
