/**
 * @vitest-environment happy-dom
 *
 * Four boxes, one code.
 *
 * The behaviour worth guarding is the part a host feels rather than sees: a
 * digit lands and the next box takes over without anybody reaching for it. Get
 * that wrong and the code is typed entirely into box one, which is both wrong
 * and invisible in a screenshot.
 *
 * Focus is real here. happy-dom implements document.activeElement, so these
 * check where the caret actually went rather than which box holds a class.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CodeEntry, CODE_LENGTH } from './CodeEntry';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;
/** Every value the boxes have reported, in order. */
let seen: string[];

/** A parent that holds the code, so the boxes are driven the way they really are. */
function Harness({ start }: { start: string }) {
  const [code, setCode] = useState(start);
  return createElement(CodeEntry, {
    value: code,
    label: 'Score editing code',
    onChange: (next: string) => {
      seen.push(next);
      setCode(next);
    },
  });
}

function render(start = ''): HTMLInputElement[] {
  seen = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Harness, { start }));
  });
  return boxes();
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const boxes = () => [...container.querySelectorAll('input')] as HTMLInputElement[];

/** Which box the caret is in, or -1 when it is nowhere. */
const focused = () => boxes().findIndex((b) => b === document.activeElement);

/** Types one character into a box the way a keyboard would. */
function type(box: HTMLInputElement, char: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  act(() => {
    setter.call(box, char);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(box: HTMLInputElement, key: string) {
  act(() => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('the boxes', () => {
  it('draws one per digit, and says which is which', () => {
    // Four is the instruction. Nobody has to be told how long the code is.
    const all = render();
    expect(all).toHaveLength(CODE_LENGTH);
    expect(all.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Digit 1 of 4',
      'Digit 2 of 4',
      'Digit 3 of 4',
      'Digit 4 of 4',
    ]);
  });

  it('asks the phone for a number pad, not a text keyboard', () => {
    // type="number" would bring a spinner on a desktop browser and allow "e".
    for (const box of render()) {
      expect(box.getAttribute('inputmode')).toBe('numeric');
      expect(box.getAttribute('type')).toBe('text');
      expect(box.getAttribute('maxlength')).toBe('1');
    }
  });
});

describe('typing a code', () => {
  it('moves to the next box as each digit lands', () => {
    const all = render();
    type(all[0], '4');
    expect(seen.at(-1)).toBe('4');
    expect(focused()).toBe(1);

    type(boxes()[1], '7');
    expect(seen.at(-1)).toBe('47');
    expect(focused()).toBe(2);
  });

  it('stays in the last box once four are in', () => {
    // Nowhere to advance to. The caret must not fall out of the group.
    const all = render('471');
    type(all[3], '9');
    expect(seen.at(-1)).toBe('4719');
    expect(focused()).toBe(CODE_LENGTH - 1);
  });

  it('takes no more than four, however many arrive', () => {
    const all = render('4719');
    type(all[3], '5');
    // Nothing reported, because nothing changed.
    expect(seen).toEqual([]);
  });

  it('shows one digit per box, in order', () => {
    expect(render('4719').map((b) => b.value)).toEqual(['4', '7', '1', '9']);
  });

  it('refuses anything that is not a digit', () => {
    const all = render();
    type(all[0], 'e');
    type(all[0], '-');
    type(all[0], ' ');
    expect(seen).toEqual([]);
    expect(boxes()[0].value).toBe('');
  });

  it('fills every box from one paste', () => {
    // maxLength stops a person typing four into one box, but a paste arrives
    // whole and should land whole rather than being cut to its first digit.
    const all = render();
    type(all[0], '4719');
    expect(seen.at(-1)).toBe('4719');
    expect(boxes().map((b) => b.value)).toEqual(['4', '7', '1', '9']);
  });
});

describe('correcting a code', () => {
  it('rubs out the last digit and steps back', () => {
    const all = render('471');
    press(all[2], 'Backspace');
    expect(seen.at(-1)).toBe('47');
    expect(focused()).toBe(2);
  });

  it('does nothing at an empty code, and does not fall off the front', () => {
    const all = render();
    press(all[0], 'Backspace');
    expect(seen.at(-1)).toBe('');
    expect(focused()).toBe(0);
  });

  it('walks with the arrow keys', () => {
    const all = render('4719');
    act(() => all[3].focus());
    press(boxes()[3], 'ArrowLeft');
    expect(focused()).toBe(2);
    press(boxes()[2], 'ArrowRight');
    expect(focused()).toBe(3);
  });
});

describe('tapping a box', () => {
  it('puts the caret where the next digit goes, not where the finger landed', () => {
    // Otherwise a tap on box four on a half-typed code leaves somebody typing
    // into the middle of it, and the digits come out in the wrong order.
    const all = render('47');
    act(() => all[3].focus());
    expect(focused()).toBe(2);
  });
});
