/**
 * @vitest-environment happy-dom
 *
 * The seven recorded tones. happy-dom has neither Web Audio nor a network, so
 * `AudioContext` and `fetch` are both stubbed here with just enough surface to
 * answer what this file actually needs to know: that the alarm ends up playing
 * the right recording on repeat, that it does not go silent when the recording
 * is slow or missing, that stopping cuts everything at once rather than waiting
 * out a tail, and that a preview plays once and stops itself.
 *
 * The last block is a different kind of check. It reads `public/alarms` off the
 * disk, because the tone ids in this module are also filenames, and nothing
 * else in the build would notice if the two stopped agreeing.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startAlarmLoop, stopAlarmLoop, isAlarmLoopActive, previewTone, warmUpAudio,
  preloadTone, resolveTone, ALARM_TONES, DEFAULT_ALARM_TONE, __testing,
} from './alarmSounds';

class FakeParam {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class FakeGainNode {
  gain = new FakeParam();
  connect = vi.fn();
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = new FakeParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  addEventListener = vi.fn();
}

class FakeBufferSource {
  buffer: unknown = null;
  loop = false;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  addEventListener = vi.fn();
}

/** Stands in for a decoded recording. Only its duration is ever read. */
const DECODED = { duration: 4 };

let oscillatorsCreated: FakeOscillatorNode[] = [];
let gainsCreated: FakeGainNode[] = [];
let sourcesCreated: FakeBufferSource[] = [];
let contextsCreated: FakeAudioContext[] = [];
/** What state a context is in the moment it is made. Suspended is what a phone
 *  hands back after the screen has been off. */
let initialState = 'running';

class FakeAudioContext {
  state = initialState;
  currentTime = 10;
  sampleRate = 44100;
  destination = {};
  constructor() {
    contextsCreated.push(this);
  }
  createOscillator() {
    const osc = new FakeOscillatorNode();
    oscillatorsCreated.push(osc);
    return osc;
  }
  createGain() {
    const gain = new FakeGainNode();
    gainsCreated.push(gain);
    return gain;
  }
  createBuffer = vi.fn(() => ({}));
  createBufferSource() {
    const source = new FakeBufferSource();
    sourcesCreated.push(source);
    return source;
  }
  decodeAudioData = vi.fn(async () => DECODED);
  // Deliberately does NOT wake itself: iOS refuses to resume a context from a
  // timer, and the tests that care flip `state` by hand to say when it did.
  resume = vi.fn(async () => {});
}

/** Resolves the fetch for a tone, so a test can hold a download open and say
 *  exactly when it lands. Undefined means answer straight away. */
let releaseFetch: (() => void) | undefined;
let fetchCalls: string[] = [];
/** Set to make every fetch fail, standing in for a court with no signal. */
let offline = false;

const fetchMock = vi.fn(async (url: string) => {
  fetchCalls.push(url);
  if (releaseFetch) await new Promise<void>((r) => { releaseFetch = r; });
  if (offline) throw new Error('offline');
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
});

/** Lets every already-resolved promise run its `then`. Loading a tone is three
 *  awaits deep, so one turn of the microtask queue is not enough. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Starts the loop and lets its recording arrive, which is the ordinary path:
 *  the tone was preloaded when the timer started, minutes earlier. */
async function startLoaded(id: Parameters<typeof startAlarmLoop>[0]) {
  preloadTone(id);
  await settle();
  startAlarmLoop(id);
}

beforeEach(() => {
  oscillatorsCreated = [];
  gainsCreated = [];
  sourcesCreated = [];
  contextsCreated = [];
  fetchCalls = [];
  releaseFetch = undefined;
  offline = false;
  initialState = 'running';
  fetchMock.mockClear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', fetchMock);
  __testing.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Sources actually set playing with a decoded recording in them, which is what
 *  "a tone came out" means. Matched on DECODED rather than on merely having a
 *  buffer, so the silent sample warmUpAudio pushes through is not counted. */
function playing(): FakeBufferSource[] {
  return sourcesCreated.filter((s) => s.buffer === DECODED && s.start.mock.calls.length > 0);
}

describe('resolveTone', () => {
  it('passes through a tone this build knows', () => {
    expect(resolveTone('police-whistle')).toBe('police-whistle');
  });

  it('carries each synthesized tone over to the recording that replaced it', () => {
    // A host who set one of these before the update still has it in storage.
    expect(resolveTone('bell')).toBe('clear-announce');
    expect(resolveTone('triple-chirp')).toBe('musical-alert');
    expect(resolveTone('whistle')).toBe('police-whistle');
    expect(resolveTone('buzzer')).toBe('double-beep');
    // The one name that survived onto a real recording, so it needs no map.
    expect(resolveTone('double-beep')).toBe('double-beep');
  });

  it('falls back rather than returning something unplayable', () => {
    expect(resolveTone('nothing-like-this')).toBe(DEFAULT_ALARM_TONE);
  });
});

describe('warmUpAudio', () => {
  it('pushes a silent sample through, without an audible tone', () => {
    warmUpAudio();
    // The silent unlock iOS wants inside the gesture...
    expect(sourcesCreated).toHaveLength(1);
    expect(sourcesCreated[0].start).toHaveBeenCalled();
    // ...and nothing anyone could hear.
    expect(oscillatorsCreated).toHaveLength(0);
    expect(playing()).toHaveLength(0);
  });

  it('pulls the chosen tone down there and then', () => {
    warmUpAudio('marimba-ringtone');
    expect(fetchCalls).toEqual(['/alarms/marimba-ringtone.mp3']);
  });

  it('fetches a tone once however many times it is asked for', async () => {
    preloadTone('double-beep');
    preloadTone('double-beep');
    await settle();
    preloadTone('double-beep');
    expect(fetchCalls).toEqual(['/alarms/double-beep.mp3']);
  });
});

describe('startAlarmLoop / stopAlarmLoop', () => {
  it('plays the recording on repeat and reports itself active', async () => {
    await startLoaded('police-whistle');

    expect(isAlarmLoopActive()).toBe(true);
    expect(playing()).toHaveLength(1);
    // Looping is what keeps it ringing. Nothing reschedules it.
    expect(playing()[0].loop).toBe(true);
  });

  it('rings the tone that was asked for, not the one before it', async () => {
    await startLoaded('fairy-message');
    stopAlarmLoop();
    await startLoaded('software-interface');

    expect(fetchCalls).toContain('/alarms/software-interface.mp3');
    expect(playing()).toHaveLength(2);
  });

  it('carries a synthesized tone left in storage over to its recording', async () => {
    startAlarmLoop('bell' as never);
    await settle();
    expect(fetchCalls).toEqual(['/alarms/clear-announce.mp3']);
  });

  it('schedules the recording ahead of the clock, never on it', async () => {
    await startLoaded('double-beep');
    // A source booked at exactly currentTime races the audio thread. Both that
    // and one booked behind it are how an alarm ends up ringing inaudibly.
    for (const source of playing()) {
      expect(source.start.mock.calls[0][0]).toBeGreaterThan(10);
    }
  });

  it('stop silences everything at once and clears the loop', async () => {
    await startLoaded('musical-alert');
    expect(playing()).toHaveLength(1);

    stopAlarmLoop();

    expect(isAlarmLoopActive()).toBe(false);
    expect(playing()[0].stop).toHaveBeenCalled();
    for (const gain of gainsCreated) {
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    }
  });

  it('stop is safe to call when nothing is playing', () => {
    expect(() => stopAlarmLoop()).not.toThrow();
    expect(isAlarmLoopActive()).toBe(false);
  });

  it('starting a new loop stops whatever was already playing', async () => {
    await startLoaded('clear-announce');
    const first = playing()[0];

    await startLoaded('police-whistle');

    expect(first.stop).toHaveBeenCalled();
    expect(isAlarmLoopActive()).toBe(true);
  });

  it('waits for a suspended context rather than ringing silently into it', async () => {
    initialState = 'suspended';
    preloadTone('clear-announce');
    await settle();
    vi.useFakeTimers();

    startAlarmLoop('clear-announce');

    // The alarm is on, but a phone whose audio hardware is asleep would have
    // heard none of what a naive implementation scheduled here.
    expect(isAlarmLoopActive()).toBe(true);
    expect(playing()).toHaveLength(0);
    expect(contextsCreated[0].resume).toHaveBeenCalled();

    // Still nothing while it stays asleep, however long it is left.
    vi.advanceTimersByTime(5000);
    expect(playing()).toHaveLength(0);
    // And no fallback either: the context is the problem, not the recording.
    expect(oscillatorsCreated).toHaveLength(0);

    // The screen comes back on and the audio with it.
    contextsCreated[0].state = 'running';
    vi.advanceTimersByTime(300);

    expect(playing()).toHaveLength(1);
  });
});

describe('when the recording is not there to play', () => {
  it('waits a moment for a slow download rather than beeping over it', async () => {
    vi.useFakeTimers();
    releaseFetch = () => {};
    startAlarmLoop('clear-announce');

    // Held mid-download. The alarm is on and has made no sound of its own yet.
    vi.advanceTimersByTime(500);
    expect(isAlarmLoopActive()).toBe(true);
    expect(oscillatorsCreated).toHaveLength(0);
    expect(playing()).toHaveLength(0);
  });

  it('beeps on its own once the wait has gone on too long', async () => {
    vi.useFakeTimers();
    releaseFetch = () => {};
    startAlarmLoop('clear-announce');

    vi.advanceTimersByTime(1500);

    // Not the chosen tone, but a round that ended is being announced.
    expect(oscillatorsCreated.length).toBeGreaterThan(0);
    expect(playing()).toHaveLength(0);
  });

  it('takes the recording over from the fallback the moment it lands', async () => {
    vi.useFakeTimers();
    releaseFetch = () => {};
    startAlarmLoop('clear-announce');
    vi.advanceTimersByTime(1500);
    expect(oscillatorsCreated.length).toBeGreaterThan(0);

    // The download finishes.
    releaseFetch?.();
    releaseFetch = undefined;
    await vi.advanceTimersByTimeAsync(1200);

    expect(playing()).toHaveLength(1);
    expect(playing()[0].loop).toBe(true);
  });

  it('keeps beeping when the download cannot succeed at all', async () => {
    vi.useFakeTimers();
    offline = true;
    startAlarmLoop('clear-announce');

    await vi.advanceTimersByTimeAsync(1200);
    const firstBeeps = oscillatorsCreated.length;
    expect(firstBeeps).toBeGreaterThan(0);

    // An alarm nobody has silenced is still an alarm several seconds later.
    await vi.advanceTimersByTimeAsync(3000);
    expect(oscillatorsCreated.length).toBeGreaterThan(firstBeeps);
    expect(isAlarmLoopActive()).toBe(true);

    stopAlarmLoop();
  });
});

describe('previewTone', () => {
  it('plays the tone through once, not on repeat', async () => {
    previewTone('fairy-message');
    await settle();

    expect(playing()).toHaveLength(1);
    expect(playing()[0].loop).toBe(false);
  });

  it('stops itself when the tone is over, and not before', async () => {
    // Fake timers before the preview, not after: the timeout that ends it is
    // booked inside previewTone and a later swap would never see it.
    vi.useFakeTimers();
    previewTone('clear-announce');
    await vi.advanceTimersByTimeAsync(0);
    const source = playing()[0];
    expect(source).toBeDefined();

    // DECODED runs four seconds.
    await vi.advanceTimersByTimeAsync(3000);
    expect(source.stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(source.stop).toHaveBeenCalled();
  });

  it('does not leave the loop marked active', async () => {
    previewTone('clear-announce');
    await settle();
    expect(isAlarmLoopActive()).toBe(false);
  });

  it('drops a preview whose download landed after somebody moved on', async () => {
    releaseFetch = () => {};
    previewTone('marimba-ringtone');
    const held = releaseFetch;

    // A second row is tapped, and its own tone is already in hand.
    releaseFetch = undefined;
    previewTone('double-beep');
    await settle();
    expect(playing()).toHaveLength(1);

    // Now the first one finally arrives. Nobody is waiting for it.
    held?.();
    await settle();
    expect(playing()).toHaveLength(1);
  });

  it('makes no fallback noise when a tone cannot be fetched', async () => {
    offline = true;
    previewTone('police-whistle');
    await settle();

    // Unlike the alarm, a preview that cannot say the truth says nothing.
    expect(oscillatorsCreated).toHaveLength(0);
    expect(playing()).toHaveLength(0);
  });
});

describe('ALARM_TONES', () => {
  it('lists seven, each with a distinct id and label', () => {
    expect(ALARM_TONES).toHaveLength(7);
    expect(new Set(ALARM_TONES.map((t) => t.id)).size).toBe(7);
    expect(new Set(ALARM_TONES.map((t) => t.label)).size).toBe(7);
  });

  it('opens on the default, which is the one tone that is precached', () => {
    expect(ALARM_TONES[0].id).toBe(DEFAULT_ALARM_TONE);
  });

  it('names a file that is really in public/alarms, and leaves none behind', () => {
    // The ids are filenames. Rename one without renaming the other and every
    // test above still passes against a stub, while the real app plays nothing.
    const onDisk = readdirSync(resolve(__dirname, '../../public/alarms')).sort();
    expect(ALARM_TONES.map((t) => `${t.id}.mp3`).sort()).toEqual(onDisk);
  });

  it('fetches each one from its own address', async () => {
    for (const { id } of ALARM_TONES) {
      __testing.reset();
      fetchCalls = [];
      preloadTone(id);
      expect(fetchCalls).toEqual([`/alarms/${id}.mp3`]);
    }
  });
});
