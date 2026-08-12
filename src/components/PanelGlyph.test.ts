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
import { SettingsPanel } from './layout/SettingsPanel';
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

/**
 * Getting the app onto a home screen is the one instruction in here that
 * somebody follows outside the app, on buttons this page cannot point at. The
 * words have to match the browser they are being read in, so each route is
 * rendered under the user agent that produces it.
 */
describe('the Add to Home Screen steps', () => {
  const SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const CHROME_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';

  /** Renders the panel as the browser that user agent belongs to would see it. */
  function asBrowser(ua: string): string {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
    mount(createElement(InstallPanel, { canPrompt: false, onInstall: noop, onClose: noop }));
    return container.textContent ?? '';
  }

  it('warns that Safari may be hiding Share behind its menu', () => {
    const text = asBrowser(SAFARI);
    expect(text).toContain('at the bottom of the screen');
    expect(text).toContain('may need to tap');
    expect(text).toContain('Menu');
    // Two full lines and a shorter third, which is what that button looks like.
    const lines = [...container.querySelectorAll('ol svg line')].map((l) =>
      Number(l.getAttribute('x2')) - Number(l.getAttribute('x1'))
    );
    expect(lines.filter((w) => w > 16)).toHaveLength(2);
    expect(lines.some((w) => w > 10 && w < 13)).toBe(true);
  });

  it('sends Chrome on iOS to its own Share button, top right', () => {
    const text = asBrowser(CHROME_IOS);
    expect(text).toContain('at the top right');
    // Not its three-dot menu: Chrome has a Share button of its own up there.
    expect(text).not.toContain("browser\u2019s menu");
    expect(text).toContain('Add to Home Screen');
  });

  /**
   * By the time that sheet is open the host knows what to do, and a third step
   * made the shortest route look like the longest.
   */
  it('never tells anybody to tap Add afterwards', () => {
    for (const ua of [SAFARI, CHROME_IOS]) {
      const text = asBrowser(ua);
      // The step that went said "Tap Add, top right". "Tap Add to Home
      // Screen" is the step that stayed, so the whole phrase is the check.
      expect(text).not.toContain('Add</strong>, top right');
      expect(text).not.toContain('Add, top right');
      expect(container.querySelectorAll('ol li')).toHaveLength(2);
      act(() => root.unmount());
      container.remove();
    }
    // Mounted once more so the shared afterEach has something to unmount.
    asBrowser(SAFARI);
  });
});

/**
 * The order of the settings drawer. Add to Home Screen is the one item that
 * goes away for good once it is done, and it was sitting below an account the
 * host may never make.
 */
describe('the settings drawer', () => {
  it('offers Add to Home Screen first', () => {
    mount(
      createElement(SettingsPanel, {
        open: true,
        onShare: noop,
        onOpenAccount: noop,
        showAccountItem: true,
        signedIn: false,
        onOpenInstall: noop,
        showInstallItem: true,
        onToggleLargeText: noop,
        onOpenDefaultRating: noop,
        onOpenImportExport: noop,
        onOpenInstructions: noop,
        onOpenDonate: noop,
        onOpenFeature: noop,
        onOpenBug: noop,
      })
    );
    const items = [...container.querySelectorAll('nav button')].map((b) =>
      (b.textContent ?? '').trim()
    );
    expect(items[0]).toBe('Add to Home Screen');
    expect(items[1]).toBe('Share App');
  });

  it('drops it once the app is installed, without moving anything else', () => {
    mount(
      createElement(SettingsPanel, {
        open: true,
        onShare: noop,
        onOpenAccount: noop,
        showAccountItem: true,
        signedIn: false,
        onOpenInstall: noop,
        showInstallItem: false,
        onToggleLargeText: noop,
        onOpenDefaultRating: noop,
        onOpenImportExport: noop,
        onOpenInstructions: noop,
        onOpenDonate: noop,
        onOpenFeature: noop,
        onOpenBug: noop,
      })
    );
    const items = [...container.querySelectorAll('nav button')].map((b) =>
      (b.textContent ?? '').trim()
    );
    expect(items).not.toContain('Add to Home Screen');
    expect(items[0]).toBe('Share App');
  });
});
