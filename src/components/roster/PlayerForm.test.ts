/**
 * @vitest-environment happy-dom
 *
 * The row of buttons under the player form.
 *
 * Editing a player used to offer Update, then Cancel, then Delete. Every other
 * pair in the app that sits on one line reads the other way — the court number
 * dialog, the score dialog and adding to a group all put Cancel on the left and
 * the button that does the thing on the right. This form was the exception, and
 * on 2026-08-15 Jeff asked for it to match.
 *
 * Order is read out of the DOM rather than off the screen. happy-dom does no
 * layout, so this holds because both rows the form draws are ordinary
 * left-to-right flex: nothing here is reversed, and nothing is ordered by CSS.
 * The test below checks that too, so the day someone adds `flex-row-reverse`
 * this stops quietly lying.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Player } from '../../types';
import { PlayerForm } from './PlayerForm';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const AVA: Player = { id: 'p1', name: 'Ava', rating: 3.5, gender: 'F', rosterIds: ['g1'] };

let root: Root;
let container: HTMLElement;

/** The form as the edit dialog draws it: a player to edit, a way out, a Delete. */
function render(props: Record<string, unknown> = {}): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(PlayerForm, {
        onSubmit: () => {},
        defaultRating: 3.5,
        editingPlayer: AVA,
        onCancelEdit: () => {},
        onDelete: () => {},
        ...props,
      })
    );
  });
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = (el: Element) => (el.textContent ?? '').trim();
const faces = () => [...container.querySelectorAll('button')].map(text);

describe('the buttons under the edit player form', () => {
  it('puts Update to the right of Cancel', () => {
    render();
    const order = faces().filter((f) => ['Cancel', 'Update', 'Delete'].includes(f));
    expect(order).toEqual(['Cancel', 'Update', 'Delete']);
  });

  it('draws them in a row that reads left to right', () => {
    // What makes the order above mean anything. Without this the DOM order
    // could be right while the screen showed the opposite.
    render();
    const update = [...container.querySelectorAll('button')].find((b) => text(b) === 'Update')!;
    const row = update.parentElement!;
    expect(row.className).not.toContain('flex-row-reverse');
    expect(row.className).not.toContain('flex-col-reverse');
    for (const b of row.querySelectorAll('button')) {
      expect(b.className).not.toMatch(/\border-\[?\d/); // no CSS `order:` overrides
    }
  });

  it('still submits on Update, wherever it is drawn', () => {
    // The swap is presentation. Update is the form's submit button, which is
    // what Enter in the name field presses, and moving it must not change that.
    render();
    const update = [...container.querySelectorAll('button')].find((b) => text(b) === 'Update')!;
    expect(update.getAttribute('type')).toBe('submit');
    const cancel = [...container.querySelectorAll('button')].find((b) => text(b) === 'Cancel')!;
    expect(cancel.getAttribute('type')).toBe('button');
  });

  it('shows no Cancel when a player is being added rather than edited', () => {
    // Nothing to swap in that case: Add Player stands alone.
    render({ editingPlayer: null, onDelete: undefined });
    expect(faces()).toContain('Add Player');
    expect(faces()).not.toContain('Cancel');
    expect(faces()).not.toContain('Update');
  });
});

/**
 * The line that says the name went somewhere.
 *
 * On the Players tab the field keeps the focus and the keyboard stays up, so
 * the list the player just landed in is behind it. Nothing else on that screen
 * changes on a press, which is why this line exists.
 */
describe('saying who was just added', () => {
  /** The form as the Players tab draws it: nothing to edit, and the announcement on. */
  const addForm = () => render({ editingPlayer: null, onDelete: undefined, announceAdded: true });

  function type(name: string) {
    const field = container.querySelector('input[type="text"]') as HTMLInputElement;
    act(() => {
      // React listens on its own value setter, so the native one has to be used
      // to make a change it will hear.
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(field, name);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function add(name: string) {
    type(name);
    const form = container.querySelector('form')!;
    act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  }

  const said = () => text(container.querySelector('[role="status"]') ?? document.createElement('i'));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the player, beside the button that added them', () => {
    vi.useFakeTimers();
    addForm();
    add('Peter');
    expect(said()).toBe('Peter was added');
  });

  it('fades and then leaves, so it never sits over the next name', () => {
    vi.useFakeTimers();
    addForm();
    add('Peter');
    // The fade is CSS; what is asserted here is that it is asked for and that
    // React takes the line out of the page when it is done.
    expect(container.querySelector('[role="status"]')!.className).toContain('fade-out-2s');
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('starts again on the next player rather than joining a fade in progress', () => {
    vi.useFakeTimers();
    addForm();
    add('Peter');
    const first = container.querySelector('[role="status"]');
    act(() => vi.advanceTimersByTime(1500));
    add('Ada');
    // A different element, which is what replays the animation, and the clock
    // is the new one's: the first name's timer must not take this one away.
    expect(container.querySelector('[role="status"]')).not.toBe(first);
    expect(said()).toBe('Ada was added');
    act(() => vi.advanceTimersByTime(1000));
    expect(said()).toBe('Ada was added');
  });

  it('says nothing on the forms that answer for themselves', () => {
    // Add Guest and Sub Player close on save and the sheet flashes its own
    // confirmation; the edit dialog closes outright.
    vi.useFakeTimers();
    render({ editingPlayer: null, onDelete: undefined });
    add('Peter');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
