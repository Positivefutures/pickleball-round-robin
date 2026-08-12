/**
 * @vitest-environment happy-dom
 *
 * Every settings panel opens with its own glyph.
 *
 * The point of the glyph is that it is *that panel's*, so the one thing worth
 * guarding is which shape landed where. A wrong icon is the failure that looks
 * fine in review: the panel renders, the title is right, and only somebody who
 * knows what a two-headed arrow means would notice it is on the wrong screen.
 *
 * So these tests do not look for "an svg". They render the icon on its own,
 * take its path data, and insist that exact drawing is the one in the panel.
 * Swap two icons over and every one of these goes red.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DefaultRatingPanel } from './layout/DefaultRatingPanel';
import { ImportExportPanel } from './layout/ImportExportPanel';
import { InstallPanel } from './layout/InstallPanel';
import { SpecialTypesPanel } from './setup/SpecialTypesPanel';
import { PartnerPairing } from './setup/PartnerPairing';
import { CourtIcon, LinkIcon, StarIcon, TwoArrowsIcon } from './icons';
import { DEFAULT_SPECIAL_TYPES } from '../lib/roundTypes';
import type { Player } from '../types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

function mount(element: ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * The first path of an icon, drawn on its own. This is the icon's fingerprint:
 * two icons in this app never share one, and it survives any change to size or
 * colour, which is what keeps this from being a test of the class attribute.
 */
function fingerprint(Icon: (props: { className?: string }) => ReactElement): string {
  const host = document.createElement('div');
  const solo = createRoot(host);
  act(() => solo.render(createElement(Icon, {})));
  const d = host.querySelector('path')?.getAttribute('d') ?? '';
  act(() => solo.unmount());
  expect(d.length).toBeGreaterThan(0);
  return d;
}

/** Whether the panel really draws that icon, wherever in it the icon sits. */
const draws = (Icon: (props: { className?: string }) => ReactElement) =>
  [...container.querySelectorAll('path')].some(
    (p) => p.getAttribute('d') === fingerprint(Icon)
  );

/** The glyph the panel opens with: the first svg in it. */
const opener = () => container.querySelector('svg');

const noop = () => {};

const PLAYERS: Player[] = [
  { id: 'p1', name: 'Ann', rating: 3.5, gender: 'F', rosterIds: ['r1'] },
  { id: 'p2', name: 'Bob', rating: 4.0, gender: 'M', rosterIds: ['r1'] },
];

describe('Default Player Rating', () => {
  it('opens with the star, the same mark a rating carries everywhere else', () => {
    mount(createElement(DefaultRatingPanel, { rating: 3.5, onChange: noop, onClose: noop }));
    expect(draws(StarIcon)).toBe(true);
  });
});

describe('Import / Export Groups', () => {
  it('opens with the two arrows: one file out, one file in', () => {
    mount(
      createElement(ImportExportPanel, {
        rosters: [{ id: 'r1', name: 'Tuesday Night' }],
        players: PLAYERS,
        activeRosterId: 'r1',
        onExport: noop,
        onImport: async () => ({ ok: true, title: 'Done', details: [] }),
        onClose: noop,
      })
    );
    expect(draws(TwoArrowsIcon)).toBe(true);
  });
});

describe('Special Game Types', () => {
  it('opens with the court', () => {
    mount(
      createElement(SpecialTypesPanel, {
        specialTypes: DEFAULT_SPECIAL_TYPES,
        onChange: noop,
        onMove: noop,
        onClose: noop,
      })
    );
    expect(draws(CourtIcon)).toBe(true);
  });

  it('lays that court on its side, so it is not the one on the buttons', () => {
    mount(
      createElement(SpecialTypesPanel, {
        specialTypes: DEFAULT_SPECIAL_TYPES,
        onChange: noop,
        onMove: noop,
        onClose: noop,
      })
    );
    expect(opener()?.getAttribute('class')).toContain('rotate-90');
  });
});

describe('Set Partners', () => {
  it('carries the chain link beside its heading, not above it', () => {
    mount(
      createElement(PartnerPairing, {
        players: PLAYERS,
        partnerships: [],
        pendingId: null,
        onTapPlayer: noop,
        onUnpair: noop,
      })
    );
    const heading = container.querySelector('h3');
    expect(heading?.textContent).toContain('Set Partners');
    expect(heading?.querySelector('svg')).not.toBeNull();
    expect(draws(LinkIcon)).toBe(true);
  });

  it('draws it in the indigo, which is neither of the two brand colours', () => {
    mount(
      createElement(PartnerPairing, {
        players: PLAYERS,
        partnerships: [],
        pendingId: null,
        onTapPlayer: noop,
        onUnpair: noop,
      })
    );
    // The hex itself. A one-off colour has nowhere else to be written down, so
    // this is the only thing standing between it and a quiet edit.
    expect(container.querySelector('h3 svg')?.getAttribute('class')).toContain('#615fff');
  });
});

describe('Add to Home Screen', () => {
  it('shows the app icon: the real logo, on a tile with iOS corners', () => {
    mount(createElement(InstallPanel, { canPrompt: true, onInstall: noop, onClose: noop }));
    const logo = container.querySelector('img[src="/logo.png"]');
    expect(logo).not.toBeNull();
    expect(logo?.parentElement?.getAttribute('class')).toContain('rounded-[14px]');
  });

  it('draws the tile an edge, because a white tile on a white panel has none', () => {
    mount(createElement(InstallPanel, { canPrompt: true, onInstall: noop, onClose: noop }));
    const tile = container.querySelector('img[src="/logo.png"]')?.parentElement;
    const classes = tile?.getAttribute('class') ?? '';
    // Both, deliberately. A shadow can be all but invisible on a poor screen
    // and a hairline can be lost to a scaled-down render; together they hold.
    expect(classes).toContain('border');
    expect(classes).toContain('shadow');
  });

  it('points at a file that is really published', () => {
    // The src the panel actually renders, not a path written out again here. A
    // broken image is invisible to a test that only reads the DOM: the element
    // is there, the alt is empty by design, and the tile just looks blank.
    mount(createElement(InstallPanel, { canPrompt: true, onInstall: noop, onClose: noop }));
    const src = container.querySelector('img')?.getAttribute('src') ?? '';
    expect(src.startsWith('/')).toBe(true);
    // public/ is copied to the site root by Vite, so the src is the path.
    const repo = resolve(__dirname, '../..');
    expect(() => readFileSync(resolve(repo, `public${src}`))).not.toThrow();
  });
});

describe('the glyph itself', () => {
  it('is hidden from a screen reader, so the title is not read twice', () => {
    mount(createElement(DefaultRatingPanel, { rating: 3.5, onChange: noop, onClose: noop }));
    expect(opener()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('takes the primary teal, in every panel that has one', () => {
    mount(createElement(DefaultRatingPanel, { rating: 3.5, onChange: noop, onClose: noop }));
    // Set on the wrapper rather than the artwork: the icons take the colour of
    // the text around them, which is what lets one drawing serve a teal panel
    // heading and a white button face without being drawn twice.
    expect(opener()?.parentElement?.getAttribute('class')).toContain('text-brand-teal');
  });
});

/**
 * The drawings do not fill their boxes equally: the two gendered symbols reach
 * the edges, the mixed one fills 77% of its height. At one box size the mixed
 * one read as the small icon on the panel, so each carries its own.
 */
describe('the game type symbols', () => {
  function heading(title: string): Element {
    mount(
      createElement(SpecialTypesPanel, {
        specialTypes: DEFAULT_SPECIAL_TYPES,
        onChange: noop,
        onMove: noop,
        onClose: noop,
      })
    );
    const found = [...container.querySelectorAll('h3')].find((h) =>
      (h.textContent ?? '').includes(title)
    );
    if (!found) throw new Error(`no heading for ${title}`);
    return found;
  }

  /** The box the drawing is given, in px, off its own size class. */
  function boxOf(h: Element): number {
    const found = h.querySelector('svg')?.getAttribute('class')?.match(/h-\[(\d+)px\]/);
    if (!found) throw new Error('that heading has no sized glyph');
    return Number(found[1]);
  }

  it('draws the mixed symbol in a bigger box than the gendered ones', () => {
    const mixed = boxOf(heading('Mixed'));
    act(() => root.unmount());
    container.remove();
    const gendered = boxOf(heading('Gendered'));

    expect(gendered).toBe(26);
    expect(mixed).toBeGreaterThan(gendered);
  });
});
