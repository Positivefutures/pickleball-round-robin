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
import { describe, it, expect, afterEach } from 'vitest';
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
