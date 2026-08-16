/**
 * @vitest-environment happy-dom
 *
 * The five synthesized tones. happy-dom has no real Web Audio, so
 * `AudioContext` is stubbed here with just enough surface — oscillators,
 * gains, envelope scheduling — to answer what this file actually needs to
 * know: that starting the loop schedules repeating shots, that stopping it
 * silences everything already scheduled rather than waiting out a decay, and
 * that a preview plays once and stops itself.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startAlarmLoop, stopAlarmLoop, isAlarmLoopActive, previewTone, warmUpAudio, ALARM_TONES,
  __testing,
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
  private ended: (() => void)[] = [];
  addEventListener(type: string, listener: () => void) {
    if (type === 'ended') this.ended.push(listener);
  }
}

class FakeBufferSource {
  buffer: unknown = null;
  connect = vi.fn();
  start = vi.fn();
}

let oscillatorsCreated: FakeOscillatorNode[] = [];
let gainsCreated: FakeGainNode[] = [];
let buffersCreated: FakeBufferSource[] = [];
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
    buffersCreated.push(source);
    return source;
  }
  // Deliberately does NOT wake itself: iOS refuses to resume a context from a
  // timer, and the tests that care flip `state` by hand to say when it did.
  resume = vi.fn(async () => {});
}

beforeEach(() => {
  oscillatorsCreated = [];
  gainsCreated = [];
  buffersCreated = [];
  contextsCreated = [];
  initialState = 'running';
  vi.stubGlobal('AudioContext', FakeAudioContext);
  __testing.reset();
});

/** Every gain envelope opens at `startTime`, so a shot is only audible if that
 *  moment is still ahead of the context's own clock. */
function envelopeStarts(): number[] {
  return gainsCreated.flatMap((gain) =>
    gain.gain.setValueAtTime.mock.calls
      .filter(([value]) => value !== 0)
      .map(([, at]) => at as number)
  );
}

describe('warmUpAudio', () => {
  it('pushes a silent sample through, without an audible tone', () => {
    warmUpAudio();
    // The silent unlock iOS wants inside the gesture...
    expect(buffersCreated).toHaveLength(1);
    expect(buffersCreated[0].start).toHaveBeenCalled();
    // ...and nothing anyone could hear.
    expect(oscillatorsCreated).toHaveLength(0);
  });
});

describe('startAlarmLoop / stopAlarmLoop', () => {
  it('plays a shot immediately and reports itself active', () => {
    startAlarmLoop('bell');
    expect(isAlarmLoopActive()).toBe(true);
    // bell layers two oscillators per shot.
    expect(oscillatorsCreated.length).toBeGreaterThanOrEqual(2);
  });

  it('reschedules itself, so a second tick is a second shot', () => {
    vi.useFakeTimers();
    startAlarmLoop('double-beep');
    const firstRoundCount = oscillatorsCreated.length;

    vi.advanceTimersByTime(2000); // longer than double-beep's own ~0.9s period

    expect(oscillatorsCreated.length).toBeGreaterThan(firstRoundCount);
    vi.useRealTimers();
  });

  it('stop silences every scheduled gain immediately and clears the loop', () => {
    startAlarmLoop('buzzer');
    expect(gainsCreated.length).toBeGreaterThan(0);

    stopAlarmLoop();

    expect(isAlarmLoopActive()).toBe(false);
    for (const gain of gainsCreated) {
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    }
  });

  it('stop is safe to call when nothing is playing', () => {
    expect(() => stopAlarmLoop()).not.toThrow();
    expect(isAlarmLoopActive()).toBe(false);
  });

  it('starting a new loop stops whatever was already playing', () => {
    startAlarmLoop('bell');
    expect(isAlarmLoopActive()).toBe(true);
    startAlarmLoop('whistle');
    expect(isAlarmLoopActive()).toBe(true);
  });

  it('schedules every envelope ahead of the clock, never on it', () => {
    startAlarmLoop('bell');
    const starts = envelopeStarts();
    expect(starts.length).toBeGreaterThan(0);
    // A shot booked at exactly currentTime races the audio thread, and one
    // booked behind it has already decayed to silence by the time anything
    // renders. Both are how an alarm ends up ringing inaudibly.
    for (const at of starts) expect(at).toBeGreaterThan(10);
  });

  it('waits for a suspended context rather than ringing silently into it', () => {
    vi.useFakeTimers();
    initialState = 'suspended';

    startAlarmLoop('bell');

    // The alarm is on, but a phone whose audio hardware is asleep would have
    // heard none of what a naive implementation scheduled here.
    expect(isAlarmLoopActive()).toBe(true);
    expect(oscillatorsCreated).toHaveLength(0);
    expect(contextsCreated[0].resume).toHaveBeenCalled();

    // Still nothing while it stays asleep, however long it is left.
    vi.advanceTimersByTime(5000);
    expect(oscillatorsCreated).toHaveLength(0);

    // The screen comes back on and the audio with it.
    contextsCreated[0].state = 'running';
    vi.advanceTimersByTime(300);

    expect(oscillatorsCreated.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});

describe('previewTone', () => {
  it('plays one shot and stops itself after 2 seconds, not before', () => {
    vi.useFakeTimers();
    previewTone('triple-chirp');
    expect(oscillatorsCreated.length).toBeGreaterThan(0);
    const playedGains = gainsCreated;

    vi.advanceTimersByTime(1000);
    for (const gain of playedGains) {
      expect(gain.gain.setValueAtTime).not.toHaveBeenCalledWith(0, expect.any(Number));
    }

    vi.advanceTimersByTime(1500);
    for (const gain of playedGains) {
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    }
    vi.useRealTimers();
  });

  it('does not leave the loop marked active', () => {
    previewTone('bell');
    expect(isAlarmLoopActive()).toBe(false);
  });
});

describe('ALARM_TONES', () => {
  it('lists exactly five, each playable', () => {
    expect(ALARM_TONES).toHaveLength(5);
    for (const { id } of ALARM_TONES) {
      oscillatorsCreated = [];
      previewTone(id);
      expect(oscillatorsCreated.length).toBeGreaterThan(0);
    }
  });
});
