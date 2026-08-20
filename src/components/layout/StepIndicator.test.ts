/**
 * @vitest-environment happy-dom
 *
 * The three step tabs must never be on two lines.
 *
 * They wrapped on a 375px phone — an SE, a mini — where "3. Schedule" wanted
 * 92px and had 88.7. All three tabs are one width, so the one that broke took
 * the bar's height with it and the other two sat in a row that had grown for
 * somebody else's label.
 *
 * happy-dom has no layout, so the pixels are measured against a real browser
 * elsewhere and what is checked here is the arrangement that produces the
 * behaviour. Three rules, and they only work together: nowrap is the guarantee,
 * a size taken from the bar's own width rather than from rem is what makes room
 * for it — rem is the one thing Safari's page zoom does not scale — and the
 * icon stands down on the narrowest bars, where 24px a tab is the difference.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StepIndicator } from './StepIndicator';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(StepIndicator, {
        current: 'setup',
        available: ['roster'],
        answering: [],
        onNavigate: () => {},
      })
    );
  });
  return container;
}

const tabs = () => [...render().querySelectorAll('nav button')] as HTMLButtonElement[];

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the step tabs', () => {
  it('never lets a label wrap', () => {
    for (const tab of tabs()) {
      expect(tab.className.split(/\s+/)).toContain('whitespace-nowrap');
    }
  });

  it('sizes the label from the bar rather than from the root font', () => {
    // cqi, not rem. Safari's page zoom narrows the CSS viewport and leaves rem
    // where it was, so a tab measured in rem keeps its size while the room it
    // has to sit in shrinks — which is the only way "2. Setup", the shortest of
    // the three, could have been the one seen breaking in half.
    const nav = render().querySelector('nav')!;
    expect(nav.className.split(/\s+/)).toContain('@container');
    for (const tab of nav.querySelectorAll('button')) {
      const size = tab.className.split(/\s+/).find((c) => c.startsWith('text-['));
      expect(size).toBe('text-[clamp(0.75rem,5.4cqi,1.0125rem)]');
    }
  });

  it('drops the icon on a bar too narrow to afford it', () => {
    // 24px of a tab that has 99 at 320px, and the one thing here that can go:
    // the word is what the tab is for.
    const icons = [...render().querySelectorAll('nav button > span')].filter((s) =>
      s.querySelector('svg')
    );
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon.className.split(/\s+/)).toContain('@max-[23rem]:hidden');
    }
  });

  it('cuts a label it cannot fit rather than widening the page', () => {
    // The backstop under the other three, and the reason the old rule chose
    // wrapping: a tab must never push the page wider than the phone.
    for (const tab of tabs()) {
      expect(tab.className.split(/\s+/)).toContain('overflow-hidden');
    }
  });
});
