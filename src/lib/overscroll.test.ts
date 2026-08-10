/**
 * Nothing above the header, nothing below the footer.
 *
 * Dragging past either end of a phone screen used to pull the whole app with
 * it. The settings drawer is fixed and so does not move, which meant a stripe
 * of the dark menu appeared behind an app that looked like it had come loose.
 *
 * Two things stop it, and they are in different files, which is exactly why
 * they are checked together here. The stylesheet refuses the overscroll at all.
 * The drawer is not painted while it is shut, so there is nothing behind the
 * app to show even on a browser that bounces anyway.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const drawer = readFileSync(
  resolve(__dirname, '../components/layout/SettingsPanel.tsx'),
  'utf8'
);

describe('the edges of the screen', () => {
  it('refuses to overscroll the document at all', () => {
    // On the document rather than on a panel inside it: the bounce belongs to
    // the page, and a rule on a child cannot refuse it.
    expect(css).toMatch(/html,\s*\n?body\s*\{[^}]*overscroll-behavior:\s*none/);
  });

  it('keeps the drawer out of sight until it is opened', () => {
    expect(drawer).toContain("open ? 'visible delay-0' : 'invisible delay-300'");
  });

  it('waits for the panel to finish sliding before hiding it again', () => {
    // The delay has to outlast the slide. Hiding the drawer instantly would
    // show it disappear from under a panel still on its way back across it.
    const slide = /duration-(\d+)/.exec(readFileSync(resolve(__dirname, '../App.tsx'), 'utf8'));
    expect(slide).not.toBeNull();
    const hide = /invisible delay-(\d+)/.exec(drawer);
    expect(hide).not.toBeNull();
    expect(Number(hide![1])).toBeGreaterThanOrEqual(Number(slide![1]));
  });
});
