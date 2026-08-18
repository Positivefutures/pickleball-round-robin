/**
 * @vitest-environment happy-dom
 *
 * The Round Timer, driven end to end on the real App — the behaviors that
 * only a mounted App can answer: that an alarm forces the panel back open on
 * a tab the timer was never opened from, that a second round's icon is
 * refused while one is running, that DONE takes a running timer away, and
 * that regenerating the schedule releases it. The controller's own state
 * machine and the tone synthesis are covered on their own, in
 * lib/roundTimer.test.ts and lib/alarmSounds.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { runMigrations } from './lib/migrations';
import { __testing as roundTimerTesting } from './lib/roundTimer';
import { ALARM_TONES } from './lib/alarmSounds';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = [
  'Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kit', 'Lex',
];

function seed(inGroup: number, selected: number, courts: number) {
  window.localStorage.clear();
  const players = NAMES.slice(0, inGroup).map((name, i) => ({
    id: `p${i + 1}`,
    name,
    rating: 3.5 + (i % 4) * 0.25,
    gender: i % 2 === 0 ? 'M' : 'F',
    rosterIds: ['g1'],
  }));
  window.localStorage.setItem('pb-rosters', JSON.stringify([{ id: 'g1', name: 'Test Group' }]));
  window.localStorage.setItem('pb-active-roster', JSON.stringify('g1'));
  window.localStorage.setItem('pb-roster', JSON.stringify(players));
  window.localStorage.setItem(
    'pb-selected-ids',
    JSON.stringify(players.slice(0, selected).map((p) => p.id))
  );
  window.localStorage.setItem('pb-num-courts', JSON.stringify(courts));
  window.localStorage.setItem('pb-num-rounds', JSON.stringify(8));
  runMigrations();
}

/**
 * Just enough of AudioContext that startTimer()'s warm-up doesn't throw —
 * nothing here asserts on the sound itself, that's alarmSounds.test.ts.
 *
 * `fetch` is stubbed alongside it in beforeEach, because the warm-up also
 * pulls down the chosen tone. Left alone, happy-dom takes that literally and
 * the suite makes a real request for a file no server here is serving.
 */
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return {
      buffer: null, loop: false,
      connect() {}, start() {}, stop() {}, addEventListener() {},
    };
  }
  async decodeAudioData() {
    return { duration: 4, numberOfChannels: 1 };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
      addEventListener() {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect() {},
    };
  }
  async resume() {}
}

let root: Root;
let container: HTMLElement;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(App));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  roundTimerTesting.reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function text(el: Element): string {
  return (el.textContent ?? '').trim();
}

function buttons(re: RegExp, scope: ParentNode = container): HTMLElement[] {
  return [...scope.querySelectorAll('button, [role="button"]')].filter((b) =>
    re.test(text(b))
  ) as HTMLElement[];
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

function clickButton(re: RegExp, scope: ParentNode = container) {
  const found = buttons(re, scope);
  if (found.length === 0) {
    throw new Error(`no button matching ${re}; saw: ${[...scope.querySelectorAll('button')]
      .map((b) => JSON.stringify(text(b).slice(0, 30))).join(', ')}`);
  }
  click(found[0]);
}

function clickLabel(label: string, scope: ParentNode = container) {
  const el = scope.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no control labelled ${label}`);
  click(el);
}

function roundCard(n: number): HTMLElement {
  const heading = new RegExp(`^Round ${n}$`);
  const card = [...container.querySelectorAll('.round-card')].find((c) =>
    heading.test(text(c.querySelector('h3') ?? c))
  );
  if (!card) throw new Error(`no card for Round ${n}`);
  return card as HTMLElement;
}

function checkbox(n: number): HTMLInputElement {
  return roundCard(n).querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function generate() {
  clickButton(/^Continue to Setup/);
  clickButton(/^Generate Schedule/);
}

function tab(label: RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll('nav button')].find((b) => label.test(text(b)));
  if (!found) throw new Error(`no step tab matching ${label}`);
  return found as HTMLButtonElement;
}

/** The Round Timer panel, found by its own role rather than by position —
 *  distinct from the Actions sheet, which is also a `role="dialog"`. */
function timerPanel(): HTMLElement | null {
  return container.querySelector('[role="dialog"][aria-label="Round Timer"]');
}

function openTimer(n: number) {
  clickLabel('Round timer', roundCard(n));
}

function storedTimer(): { roundNumber: number | null; phase: string; alarmTone: string } {
  return JSON.parse(
    window.localStorage.getItem('pb-round-timer')
    ?? '{"roundNumber":null,"phase":"idle","alarmTone":""}'
  );
}

describe('Round Timer', () => {
  beforeEach(() => {
    seed(9, 9, 2);
    mount();
    generate();
  });

  it('shows the timer icon on an open round, and hides it once DONE is checked', () => {
    expect(roundCard(1).querySelector('[aria-label="Round timer"]')).not.toBeNull();

    click(checkbox(1));

    expect(roundCard(1).querySelector('[aria-label="Round timer"]')).toBeNull();
  });

  it('opens the panel for the round it was tapped on, showing the full default length', () => {
    openTimer(1);

    const panel = timerPanel();
    expect(panel).not.toBeNull();
    expect(text(panel!)).toContain('Round 1');
    expect(text(panel!)).toContain('12:00');
  });

  it('names the round it belongs to in the heading, and only there', () => {
    openTimer(2);

    const panel = timerPanel()!;
    expect(text(panel.querySelector('h2')!)).toBe('Round 2 Timer');
    // The round used to be said twice, once in a bare "Round 2" under the
    // title. Jeff's call: the heading says it.
    expect(text(panel).match(/Round 2/g)).toHaveLength(1);
  });

  it('keeps Reset in place when Stop turns back into Start Timer', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);

    // Counting down: stop it, or take it back to the top.
    expect(buttons(/^Stop$/, timerPanel()!)).toHaveLength(1);
    expect(buttons(/^Reset$/, timerPanel()!)).toHaveLength(1);
    expect(buttons(/^Start Timer$/, timerPanel()!)).toHaveLength(0);

    clickButton(/^Stop$/, timerPanel()!);

    // Stopped, and still three tiles: only the middle one changed.
    expect(buttons(/^Start Timer$/, timerPanel()!)).toHaveLength(1);
    expect(buttons(/^Reset$/, timerPanel()!)).toHaveLength(1);
    expect(buttons(/^Stop$/, timerPanel()!)).toHaveLength(0);

    // Reset is the only way back to two tiles and the settings under them.
    clickButton(/^Reset$/, timerPanel()!);
    expect(buttons(/^Reset$/, timerPanel()!)).toHaveLength(0);
    expect(buttons(/^Start Timer$/, timerPanel()!)).toHaveLength(1);
    expect(timerPanel()!.querySelector('[aria-label="Fewer minutes"]')).not.toBeNull();
  });

  /**
   * The row of tiles the sheet is answered with, and the corner key it replaced.
   *
   * Close is always the leftmost, because the key it stands in for is the one
   * thing a host reaches for without reading, and it has to be in the same
   * place whether the clock is running or not.
   */
  it('answers with tiles: Close, then what there is to do', () => {
    openTimer(1);

    /** The labels of the tiles under the clock, left to right. */
    const row = () =>
      [...timerPanel()!.querySelectorAll('button')]
        .filter((b) => b.className.includes('flex-col') && b.querySelector('svg'))
        .map((b) => text(b));

    expect(row()).toEqual(['Close', 'Start Timer']);

    clickButton(/^Start Timer$/, timerPanel()!);
    expect(row()).toEqual(['Close', 'Stop', 'Reset']);

    // No X in the corner: the sheet used to carry one, and with Close in the
    // row it would be a second way out to read past.
    expect(timerPanel()!.querySelector('[aria-label="Close Round Timer"]')).toBeNull();
  });

  it('hides the minutes stepper and the alerts once it is counting', () => {
    openTimer(1);
    expect(timerPanel()!.querySelector('[aria-label="Fewer minutes"]')).not.toBeNull();

    clickButton(/^Start Timer$/, timerPanel()!);

    expect(timerPanel()!.querySelector('[aria-label="Fewer minutes"]')).toBeNull();
    expect(text(timerPanel()!)).not.toContain('When time is up');
  });

  it('closing the panel leaves the countdown running in the background', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);

    expect(timerPanel()).toBeNull();
    expect(storedTimer().phase).toBe('running');
  });

  it('counts down on the round card itself, with the clock ahead of the time', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);

    const chip = roundCard(1).querySelector('[aria-label="Round timer"]')!;
    expect(text(chip)).toBe('12:00');
    // Icon first, digits second — the icon is what the eye finds, and reading
    // the pair the other way round puts a number against the round heading
    // with nothing saying what it counts.
    expect(chip.firstElementChild!.tagName.toLowerCase()).toBe('svg');

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(text(chip)).toBe('10:55');
  });

  it('shows a bare clock on a round with no timer of its own', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);

    expect(text(roundCard(2).querySelector('[aria-label="Round timer"]')!)).toBe('');
  });

  it('keeps the time on the card while the timer is stopped, not just while it runs', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    clickButton(/^Stop$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);

    const chip = roundCard(1).querySelector('[aria-label="Round timer"]')!;
    expect(text(chip)).toBe('11:30');

    // Frozen, not counting: a stopped timer that went on ticking on the card
    // would say the round was still running.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(text(chip)).toBe('11:30');
  });

  it('checking DONE while its timer is running stops and releases it', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);
    expect(storedTimer().phase).toBe('running');

    click(checkbox(1));

    expect(storedTimer()).toEqual(expect.objectContaining({ roundNumber: null, phase: 'idle' }));
  });

  it('refuses a second round while one is running, naming the round that is', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);

    openTimer(2);

    expect(text(document.body)).toContain('Stop Round 1');
    expect(timerPanel()).toBeNull();
    clickButton(/^OK$/);

    // The round already holding it reopens straight to its live countdown,
    // no dialog in the way.
    openTimer(1);
    expect(timerPanel()).not.toBeNull();
    expect(buttons(/^Stop$/, timerPanel()!)).toHaveLength(1);
  });

  it('forces the panel back open when the alarm fires, even on a different tab', () => {
    openTimer(1);
    const panel = timerPanel()!;
    for (let i = 0; i < 11; i++) clickLabel('Fewer minutes', panel); // 12 -> 1
    // Silence for this test — the tone synthesis itself is covered elsewhere,
    // and this is only checking that the panel reasserts itself.
    clickLabel('Play Sound', panel);
    clickButton(/^Start Timer$/, panel);
    clickButton(/^Close$/, panel);
    expect(timerPanel()).toBeNull();

    click(tab(/^2\. Setup/));
    expect(timerPanel()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    const alarmed = timerPanel();
    expect(alarmed).not.toBeNull();
    expect(text(alarmed!)).toContain('TIME’S UP');

    clickButton(/^Stop$/, alarmed!);
    expect(storedTimer().phase).toBe('paused');
  });

  it('releases the timer when the schedule is regenerated', () => {
    openTimer(1);
    clickButton(/^Start Timer$/, timerPanel()!);
    clickButton(/^Close$/, timerPanel()!);
    expect(storedTimer().roundNumber).toBe(1);

    click(tab(/^2\. Setup/));
    clickButton(/^Generate Schedule/);

    expect(storedTimer().roundNumber).toBeNull();
  });

  /**
   * The picker is a list of names read off ALARM_TONES, and lib/alarmSounds
   * proves each of those names is a file. What is left to check is the part
   * only a mounted App can answer: that opening the row really does put all
   * seven on screen to choose between.
   */
  it('offers all seven tones, opening on the one that is set', () => {
    openTimer(1);
    const panel = timerPanel()!;

    // Closed, the row shows the current tone and nothing else.
    expect(text(panel)).toContain('Clear Announce');
    expect(text(panel)).not.toContain('Police Whistle');

    clickButton(/^Clear Announce$/, panel);

    const listed = ALARM_TONES.filter((tone) => buttons(
      new RegExp(`^${tone.label}$`), panel
    ).length > 0);
    expect(listed).toHaveLength(7);
  });

  it('rings the tone that was picked, not the one it opened on', () => {
    openTimer(1);
    const panel = timerPanel()!;
    clickButton(/^Clear Announce$/, panel);
    clickButton(/^Police Whistle$/, panel);

    for (let i = 0; i < 11; i++) clickLabel('Fewer minutes', panel); // 12 -> 1
    clickButton(/^Start Timer$/, panel);
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(text(timerPanel()!)).toContain('TIME’S UP');
    expect(storedTimer().alarmTone).toBe('police-whistle');
  });
});
