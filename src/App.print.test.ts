/**
 * @vitest-environment happy-dom
 *
 * The printer button, driven through the real App.
 *
 * This is the bug it exists for: an app opened from an iPhone home screen has
 * no print dialog available to it, so `window.print()` returns cleanly and
 * nothing happens. Nothing throws, nothing rejects, and the app has no way to
 * find out afterwards. The tap simply did nothing, which is what was reported.
 *
 * So the thing worth pinning is not that a PDF is well formed, which is tested
 * next door, but that the button chooses a road at all, and that it leaves
 * every other platform on the one that already worked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';

const NAMES = ['Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana'];

function seed() {
  window.localStorage.clear();
  const players = NAMES.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    rating: 3.5 + (i % 4) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  }));
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Test Group' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem('pb-roster', JSON.stringify(players));
  window.localStorage.setItem('pb-selected-ids', JSON.stringify(players.map((p) => p.id)));
  window.localStorage.setItem('pb-num-courts', JSON.stringify(2));
  window.localStorage.setItem('pb-num-rounds', JSON.stringify(4));
  runMigrations();
}

let root: Root;
let container: HTMLElement;
let print: ReturnType<typeof vi.fn>;
let share: ReturnType<typeof vi.fn>;
let canShare: ReturnType<typeof vi.fn>;

/** Pretends to be one device, before App reads any of it. */
function device(opts: { ua: string; standalone: boolean; files?: boolean }) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: opts.ua,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: 5,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'standalone', {
    value: opts.standalone,
    configurable: true,
  });
  canShare = vi.fn().mockReturnValue(opts.files ?? true);
  share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'canShare', { value: canShare, configurable: true });
  Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
}

function text(): string {
  return (container.textContent ?? '').trim();
}

function buttonBy(re: RegExp): HTMLElement {
  const all = [...container.querySelectorAll('button')];
  const found = all.find((b) => re.test((b.textContent ?? '').trim()));
  if (!found) {
    throw new Error(
      `no button ${re}; saw: ${all.map((b) => JSON.stringify((b.textContent ?? '').trim().slice(0, 24))).join(', ')}`
    );
  }
  return found;
}

/** Mounts and walks to the Schedule step, which is the only step that prints. */
function onSchedule() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(App));
  });
  act(() => buttonBy(/Continue to Setup/).click());
  act(() => buttonBy(/Generate Schedule/).click());
}

function printer(): HTMLElement {
  const button = container.querySelector('button[aria-label="Print / Save PDF"]');
  if (!button) throw new Error('no printer button on this step');
  return button as HTMLElement;
}

async function tapPrint() {
  await act(async () => {
    printer().click();
  });
}

beforeEach(() => {
  seed();
  print = vi.fn();
  Object.defineProperty(window, 'print', { value: print, configurable: true });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('on anything that can print for itself', () => {
  it('asks the browser, exactly as it always did', async () => {
    device({ ua: ANDROID, standalone: false });
    onSchedule();
    await tapPrint();

    expect(print).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
  });

  it('leaves an installed Android app on the print dialog it already has', async () => {
    device({ ua: ANDROID, standalone: true });
    onSchedule();
    await tapPrint();

    expect(print).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
  });

  it('leaves a Safari tab alone too, since only the installed app is broken', async () => {
    device({ ua: IPHONE, standalone: false });
    onSchedule();
    await tapPrint();

    expect(print).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
  });
});

describe('on an iPhone opened from the home screen', () => {
  it('does not call the print that would do nothing', async () => {
    device({ ua: IPHONE, standalone: true });
    onSchedule();
    await tapPrint();

    expect(print).not.toHaveBeenCalled();
  });

  it('hands a PDF of the schedule to the share sheet instead', async () => {
    device({ ua: IPHONE, standalone: true });
    onSchedule();
    await tapPrint();

    expect(share).toHaveBeenCalledTimes(1);
    const sent = share.mock.calls[0][0] as { files: File[]; title: string };
    expect(sent.files).toHaveLength(1);
    expect(sent.files[0].type).toBe('application/pdf');
    expect(sent.files[0].name).toMatch(/\.pdf$/);
    expect(sent.files[0].size).toBeGreaterThan(500);
    expect(sent.title).toBe('RoundRobinator');
  });

  it('sends the schedule that is on screen, names and all', async () => {
    device({ ua: IPHONE, standalone: true });
    onSchedule();
    await tapPrint();

    const file = (share.mock.calls[0][0] as { files: File[] }).files[0];
    const body = Array.from(new Uint8Array(await file.arrayBuffer()), (b) =>
      String.fromCharCode(b)
    ).join('');
    expect(body.startsWith('%PDF')).toBe(true);
    // Every attending player is somewhere in the document, either on a court
    // or sitting a round out.
    for (const name of NAMES) expect(body).toContain(name);
  });

  it('says nothing when the sheet opened, including when it was closed again', async () => {
    device({ ua: IPHONE, standalone: true });
    share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
    onSchedule();
    await tapPrint();

    // Backing out is a decision. Complaining about it would be a nag.
    expect(text()).not.toContain('share sheet');
  });

  it('explains itself when the sheet will not open', async () => {
    device({ ua: IPHONE, standalone: true });
    share = vi.fn().mockRejectedValue(new Error('boom'));
    Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
    onSchedule();
    await tapPrint();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'The share sheet did not open. Try again, or use Safari to print.'
    );
  });

  it('points an older iPhone at Safari, which is the only road left', async () => {
    device({ ua: IPHONE, standalone: true, files: false });
    onSchedule();
    await tapPrint();

    expect(print).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'This device cannot print from the home screen app. Open app.pbroundrobin.com in Safari instead.'
    );
  });

  it('clears an old complaint when the button is tried again', async () => {
    device({ ua: IPHONE, standalone: true, files: false });
    onSchedule();
    await tapPrint();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    canShare.mockReturnValue(true);
    await tapPrint();

    expect(share).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('can be dismissed, because the message is advice and not a blocker', async () => {
    device({ ua: IPHONE, standalone: true, files: false });
    onSchedule();
    await tapPrint();

    act(() => (container.querySelector('button[aria-label="Dismiss"]') as HTMLElement).click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
