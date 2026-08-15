/**
 * Two rules in index.css that nothing else in the suite can see.
 *
 * Both are the kind that go wrong silently. The type floor is one line that
 * decides the size of 157 class names, so an edit that looks local is not; and
 * the swap mark is drawn by an animation, which happy-dom has no implementation
 * of, so no component test can tell whether it still does what it says.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/** The value of a custom property inside the first block matching `selector`. */
function varIn(selector: string, name: string): string | null {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) return null;
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(block[1]);
  return found ? found[1].trim() : null;
}

describe('the floor under the app type', () => {
  it('sets the two small sizes on the document rather than per class', () => {
    // Raising the variables is what makes this reach every `text-sm` in the
    // app, including the ones nobody remembered were there.
    expect(varIn(':root', '--text-xs')).toBe('0.875rem');
    expect(varIn(':root', '--text-sm')).toBe('1rem');
  });

  it('leaves nothing in the app set smaller than fourteen pixels', () => {
    // 0.875rem is 14px at the default root size, and xs is the smallest name
    // Tailwind gives us. A size below it would have to be an arbitrary value,
    // and there is one — the version line in the settings drawer.
    const xs = varIn(':root', '--text-xs');
    expect(xs).not.toBeNull();
    expect(parseFloat(xs!)).toBeGreaterThanOrEqual(0.875);
  });

  it('scales large-text mode from the new sizes, not the old ones', () => {
    // Read off 0.75 and 0.875 this would make large-text mode the smaller of
    // the two modes for anything set in `sm`, which is most of the app.
    expect(varIn('\\.text-large', '--text-xs')).toBe('calc(0.875rem * 1.35)');
    expect(varIn('\\.text-large', '--text-sm')).toBe('calc(1rem * 1.35)');
  });
});

describe('the mark a swap leaves', () => {
  const frames = /@keyframes seat-swapped\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

  it('fades the edge and the fill from colours the element hands in', () => {
    expect(frames).toContain('border-color: var(--seat-swapped-from)');
    expect(frames).toContain('background-color: var(--seat-swapped-fill)');
  });

  it('starts as thick as a selected seat and comes back to the hairline', () => {
    // 2px is what `ring-2` puts around a selected seat, so a swapped one starts
    // wearing the ring your finger just left on it.
    expect(frames).toMatch(/from\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--seat-swapped-from\)/);
    expect(frames).toMatch(/to\s*\{[^}]*box-shadow:\s*0 0 0 0 var\(--seat-swapped-from\)/);
  });

  it('grows a shadow rather than the border, so nothing moves', () => {
    // border-box sizing means a thicker border eats the content box: the name
    // inside would slide a pixel and settle back on every single swap.
    expect(frames).not.toContain('border-width');
  });

  it('still holds still for anyone who has asked for less motion', () => {
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.seat-swapped\s*\{\s*animation:\s*none/);
  });
});
