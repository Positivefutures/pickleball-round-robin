/**
 * @vitest-environment happy-dom
 *
 * Managing groups: one pencil per row, and what opens behind it.
 *
 * The panel used to put Rename beside a red Delete on every row of a scrolling
 * list. Now a row is a name and a pencil, and everything that ends a group is
 * behind it. These check the arrangement and the wiring rather than the pixels,
 * which happy-dom has none of.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Player, Roster } from '../../types';
import { ManageRostersModal } from './ManageRostersModal';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROSTERS: Roster[] = [
  { id: 'g1', name: 'Tuesday Crew' },
  { id: 'g2', name: 'Sunday Social' },
  { id: 'g3', name: 'Ladies Night' },
];

/**
 * Ava is only in Tuesday. Ben is in Tuesday and Sunday. Cara is only in Sunday.
 * So deleting Tuesday strands one player, and deleting Ladies Night strands none.
 */
const PLAYERS: Player[] = [
  { id: 'p1', name: 'Ava', rating: 3.5, gender: 'F', rosterIds: ['g1'] },
  { id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1', 'g2'] },
  { id: 'p3', name: 'Cara', rating: 3.5, gender: 'F', rosterIds: ['g2'] },
];

let root: Root;
let container: HTMLElement;

const onRename = vi.fn();
const onDelete = vi.fn();
const onDuplicate = vi.fn();
const onAdd = vi.fn();

function render(rosters: Roster[] = ROSTERS, players: Player[] = PLAYERS): HTMLElement {
  for (const fn of [onRename, onDelete, onDuplicate, onAdd]) fn.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(ManageRostersModal, {
        rosters,
        players,
        onAdd,
        onRename,
        onDelete,
        onDuplicate,
        onClose: () => {},
      })
    );
  });
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = (el: Element | null) => (el?.textContent ?? '').trim();

function click(el: Element | null | undefined) {
  if (!el) throw new Error('nothing to click');
  act(() => (el as HTMLElement).click());
}

/** Every button on screen, by its visible text. */
const faces = () => [...container.querySelectorAll('button')].map((b) => text(b));

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((b) => text(b) === name);
  if (!found) throw new Error(`no button reading "${name}" among ${JSON.stringify(faces())}`);
  return found as HTMLButtonElement;
}

/** Opens a group for editing, which is the only way to anything but its name. */
function edit(name: string) {
  const pencil = container.querySelector(`[aria-label="Edit ${name}"]`);
  if (!pencil) throw new Error(`no pencil for ${name}`);
  click(pencil);
}

/** The one text box on screen. Typing through React's own setter, not the DOM's. */
function typeInto(value: string, box?: HTMLInputElement) {
  const input = box ?? (container.querySelector('input[type="text"]') as HTMLInputElement);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the list of groups', () => {
  it('offers one pencil per group, and nothing else to press', () => {
    render();
    for (const r of ROSTERS) {
      expect(container.querySelector(`[aria-label="Edit ${r.name}"]`)).not.toBeNull();
    }
    // The pair that used to sit on every row is gone from the list entirely.
    expect(faces()).not.toContain('Rename');
    expect(faces()).not.toContain('Delete');
  });

  it('still says how many are in each group', () => {
    render();
    expect(text(container)).toContain('Tuesday Crew');
    expect(text(container)).toContain('(2)');
  });
});

describe('opening a group for editing', () => {
  it('puts the name in a box, with the four things you can do to it', () => {
    render();
    edit('Tuesday Crew');
    const box = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(box.value).toBe('Tuesday Crew');
    for (const face of ['Duplicate', 'Delete', 'Save', 'Cancel']) {
      expect(faces()).toContain(face);
    }
  });

  it('draws an icon on Duplicate and Delete, and none on Save or Cancel', () => {
    render();
    edit('Tuesday Crew');
    expect(button('Duplicate').querySelector('svg')).not.toBeNull();
    expect(button('Delete').querySelector('svg')).not.toBeNull();
    expect(button('Save').querySelector('svg')).toBeNull();
    expect(button('Cancel').querySelector('svg')).toBeNull();
  });

  it('makes Delete the red one', () => {
    render();
    edit('Tuesday Crew');
    expect(button('Delete').className).toContain('bg-red-600');
    expect(button('Save').className).toContain('bg-brand-teal');
  });

  it('saves the new name', () => {
    render();
    edit('Tuesday Crew');
    typeInto('Tuesday Night');
    click(button('Save'));
    expect(onRename).toHaveBeenCalledWith('g1', 'Tuesday Night');
  });

  it('keeps the old name when Cancel is pressed', () => {
    render();
    edit('Tuesday Crew');
    typeInto('Tuesday Night');
    click(button('Cancel'));
    expect(onRename).not.toHaveBeenCalled();
    // And the row is a row again, so the list is usable without a reload.
    expect(container.querySelector('[aria-label="Edit Tuesday Crew"]')).not.toBeNull();
  });

  it('will not save an empty name', () => {
    render();
    edit('Tuesday Crew');
    typeInto('   ');
    expect(button('Save').disabled).toBe(true);
  });

  it('refuses to delete the only group there is', () => {
    render([ROSTERS[0]]);
    edit('Tuesday Crew');
    expect(button('Delete').disabled).toBe(true);
  });
});

describe('deleting a group that would strand somebody', () => {
  function open() {
    render();
    edit('Tuesday Crew');
    click(button('Delete'));
  }

  it('says how many are stranded, and asks the one question', () => {
    open();
    expect(text(container)).toContain('1 player is only in this group. Move them or delete them?');
  });

  it('counts them up when there is more than one', () => {
    render();
    edit('Sunday Social');
    click(button('Delete'));
    // Cara is only in Sunday; Ben is in Tuesday too, so he is not stranded.
    expect(text(container)).toContain('1 player is only in this group');

    // And with two of them it reads as a plural rather than "1 players".
    act(() => root.unmount());
    container.remove();
    render(ROSTERS, [
      { id: 'p1', name: 'Ava', rating: 3.5, gender: 'F', rosterIds: ['g1'] },
      { id: 'p2', name: 'Ben', rating: 3.5, gender: 'M', rosterIds: ['g1'] },
    ]);
    edit('Tuesday Crew');
    click(button('Delete'));
    expect(text(container)).toContain('2 players are only in this group');
  });

  it('offers the other groups by name, without their counts', () => {
    open();
    const options = [...container.querySelectorAll('option')].map((o) => text(o));
    expect(options).toEqual(['Sunday Social', 'Ladies Night']);
    // The group being deleted is not somewhere to move anyone to.
    expect(options).not.toContain('Tuesday Crew');
  });

  it('moves them to the group picked, and ends the group', () => {
    open();
    const picker = container.querySelector('select') as HTMLSelectElement;
    act(() => {
      picker.value = 'g3';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click(button('Move'));
    expect(onDelete).toHaveBeenCalledWith('g1', 'g3');
  });

  it('moves them to the first group offered when the list is left alone', () => {
    open();
    click(button('Move'));
    expect(onDelete).toHaveBeenCalledWith('g1', 'g2');
  });

  it('says what Delete would cost, and takes them with it', () => {
    open();
    click(button('Delete group and 1 player'));
    expect(onDelete).toHaveBeenCalledWith('g1', null);
  });

  it('does nothing at all on Cancel', () => {
    open();
    click(button('Cancel'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(text(container)).toContain('Manage Groups');
  });
});

describe('deleting a group that strands nobody', () => {
  it('says so, and offers nowhere to move anyone', () => {
    render();
    edit('Ladies Night');
    click(button('Delete'));
    expect(text(container)).toContain('no one will be lost');
    // No dropdown, because there is nobody it would move.
    expect(container.querySelector('select')).toBeNull();
    expect(faces()).not.toContain('Move');
    expect(faces()).toContain('Delete group');
  });
});

describe('duplicating a group', () => {
  it('opens on a name that is free, so Save is one tap', () => {
    render();
    edit('Tuesday Crew');
    click(button('Duplicate'));
    const box = container.querySelector('#duplicate-name') as HTMLInputElement;
    expect(box.value).toBe('Tuesday Crew (copy)');
    expect(text(container)).toContain('New Group Name');
  });

  it('counts up rather than offering a name already taken', () => {
    render([...ROSTERS, { id: 'g4', name: 'Tuesday Crew (copy)' }]);
    edit('Tuesday Crew');
    click(button('Duplicate'));
    expect((container.querySelector('#duplicate-name') as HTMLInputElement).value).toBe(
      'Tuesday Crew (copy 2)'
    );
  });

  it('says the players end up in both, since nothing about that is obvious', () => {
    render();
    edit('Tuesday Crew');
    click(button('Duplicate'));
    expect(text(container)).toContain('The same 2 players will be in both groups.');
  });

  it('makes the group under the name that was typed', () => {
    render();
    edit('Tuesday Crew');
    click(button('Duplicate'));
    typeInto('Thursday Crew', container.querySelector('#duplicate-name') as HTMLInputElement);
    click(button('Save'));
    expect(onDuplicate).toHaveBeenCalledWith('g1', 'Thursday Crew');
  });

  it('makes nothing on Cancel', () => {
    render();
    edit('Tuesday Crew');
    click(button('Duplicate'));
    click(button('Cancel'));
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(text(container)).toContain('Manage Groups');
  });

  it('will not make one with no name at all', () => {
    render();
    edit('Tuesday Crew');
    click(button('Duplicate'));
    typeInto('  ', container.querySelector('#duplicate-name') as HTMLInputElement);
    expect(button('Save').disabled).toBe(true);
  });
});
