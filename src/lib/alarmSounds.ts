/**
 * Five alarm tones, synthesized rather than shipped as audio files — nothing
 * to add to `public/`, nothing for `precache.ts` to account for, and a court
 * with no signal still gets a sound because there's nothing to fetch.
 *
 * Each tone is a small function that schedules its own oscillators on the
 * AudioContext's own sample-accurate clock, given a start time, and returns
 * how many seconds until the next repeat should fire. `startAlarmLoop`
 * reschedules itself by that returned period until `stopAlarmLoop` is called,
 * which is also the one path that ramps every live gain node to silence
 * immediately rather than waiting out a natural decay tail.
 */

export type AlarmToneId = 'bell' | 'double-beep' | 'triple-chirp' | 'whistle' | 'buzzer';

export const ALARM_TONES: { id: AlarmToneId; label: string }[] = [
  { id: 'bell', label: 'Court Bell' },
  { id: 'double-beep', label: 'Double Beep' },
  { id: 'triple-chirp', label: 'Triple Chirp' },
  { id: 'whistle', label: 'Whistle' },
  { id: 'buzzer', label: 'Buzzer' },
];

let ctx: AudioContext | null = null;
let listening = false;

/**
 * Nudge a sleeping context awake. A phone suspends the audio hardware whenever
 * the page goes to the background, and the countdown it interrupted may have
 * minutes still to run — nothing scheduled against a suspended context is
 * heard, so every chance to bring one back is worth taking.
 */
function kick(): void {
  if (ctx && ctx.state !== 'running') void ctx.resume();
}

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    if (typeof document !== 'undefined' && !listening) {
      listening = true;
      // iOS will not resume a suspended context from a timer, only from a
      // gesture, and coming back to the foreground is the other moment it
      // becomes possible. Any touch anywhere is a gesture, so the alarm gets
      // its voice back on the host's next tap rather than staying silent for
      // the rest of the round. Both are passive and neither ever fires while
      // the context is already running.
      document.addEventListener('pointerdown', kick, { capture: true, passive: true });
      document.addEventListener('visibilitychange', kick);
    }
  }
  kick();
  return ctx;
}

/**
 * Called from startTimer()'s click handler, before anything actually plays.
 * That click is the user gesture that unlocks this AudioContext, so the
 * *ungestured* alarm the watchdog fires later — possibly minutes afterward,
 * possibly on a different tab — is actually allowed to make sound.
 *
 * Creating the context inside the gesture is enough on a desktop browser. iOS
 * wants a sound to have actually been *played* inside one, so a single silent
 * sample is pushed through as well: it costs nothing, nobody can hear it, and
 * without it an iPhone can reach the end of a twelve-minute round with an
 * unlocked-looking context that still refuses to make a noise.
 */
export function warmUpAudio(): void {
  const c = getCtx();
  try {
    const source = c.createBufferSource();
    source.buffer = c.createBuffer(1, 1, c.sampleRate);
    source.connect(c.destination);
    source.start(0);
  } catch {
    // An older engine without createBuffer, or a context torn down underneath
    // us. The alarm's own retry below is the real safety net.
  }
}

/** Every gain node currently sounding, so stopAlarmLoop() can silence them all
 *  at once instead of waiting for each one's own scheduled decay to finish. */
let activeGains: GainNode[] = [];

function trackGain(osc: OscillatorNode, gain: GainNode): void {
  activeGains.push(gain);
  osc.addEventListener('ended', () => {
    const i = activeGains.indexOf(gain);
    if (i !== -1) activeGains.splice(i, 1);
  });
}

/** One oscillator with a linear attack and an exponential decay — the shape
 *  every tone below is built from, a beep or a bell strike or a buzzer note. */
function shot(
  c: AudioContext,
  dest: AudioNode,
  startTime: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  attack: number,
  decay: number
): void {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + attack + decay + 0.05);
  trackGain(osc, gain);
}

/** A sweeping oscillator — the whistle's rise-and-fall, in one continuous note. */
function sweep(
  c: AudioContext,
  dest: AudioNode,
  startTime: number,
  freqPoints: { at: number; freq: number }[],
  peak: number,
  duration: number
): void {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqPoints[0].freq, startTime);
  for (const point of freqPoints.slice(1)) {
    osc.frequency.linearRampToValueAtTime(point.freq, startTime + point.at);
  }

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
  trackGain(osc, gain);
}

type TonePlayer = (c: AudioContext, dest: AudioNode, startTime: number) => number;

const TONE_PLAYERS: Record<AlarmToneId, TonePlayer> = {
  // A bright strike plus a quieter inharmonic overtone, for bell-like shimmer.
  bell(c, dest, t) {
    shot(c, dest, t, 'sine', 880, 0.5, 0.005, 1.2);
    shot(c, dest, t, 'sine', 2112, 0.15, 0.005, 0.6);
    return 1.6;
  },
  'double-beep'(c, dest, t) {
    shot(c, dest, t, 'sine', 1000, 0.5, 0.01, 0.12);
    shot(c, dest, t + 0.24, 'sine', 1000, 0.5, 0.01, 0.12);
    return 0.9;
  },
  'triple-chirp'(c, dest, t) {
    shot(c, dest, t, 'sine', 900, 0.5, 0.005, 0.09);
    shot(c, dest, t + 0.19, 'sine', 900, 0.5, 0.005, 0.09);
    shot(c, dest, t + 0.38, 'sine', 900, 0.5, 0.005, 0.09);
    return 0.9;
  },
  whistle(c, dest, t) {
    sweep(
      c, dest, t,
      [{ at: 0, freq: 1800 }, { at: 0.25, freq: 2400 }, { at: 0.5, freq: 1800 }],
      0.4, 0.5
    );
    return 1.0;
  },
  // Two detuned sawtooths for a harsh beat, like a game-clock buzzer.
  buzzer(c, dest, t) {
    shot(c, dest, t, 'sawtooth', 220, 0.3, 0.01, 0.5);
    shot(c, dest, t, 'sawtooth', 225, 0.3, 0.01, 0.5);
    return 0.7;
  },
};

/**
 * How far ahead of the context's own clock a tone is scheduled.
 *
 * Every tone below opens with `setValueAtTime(0.0001, startTime)` and ramps up
 * from there, so a shot booked at exactly `currentTime` is a race with the
 * audio thread that it sometimes loses — and one booked in the *past* is
 * silence outright, because by the time anything renders, the envelope has
 * already run to its own decay tail. 50ms is inaudible as a delay and puts the
 * whole envelope safely in the future.
 */
const LEAD_S = 0.05;

/** How often to look again while waiting for a suspended context to come back. */
const RETRY_MS = 250;

let loopTimeout: ReturnType<typeof setTimeout> | null = null;
/** The tone the alarm is meant to be playing, or null when it should be quiet. */
let wanted: AlarmToneId | null = null;

/** Whether the alarm is meant to be sounding — including while it is waiting
 *  on a suspended context, which is still an alarm, just not an audible one. */
export function isAlarmLoopActive(): boolean {
  return wanted !== null;
}

export function startAlarmLoop(id: AlarmToneId): void {
  stopAlarmLoop();
  wanted = id;
  const c = getCtx();

  const fire = () => {
    if (wanted === null) return;

    // A phone that spent the round with its screen off hands back a context
    // whose clock is frozen. Scheduling into that is how an alarm ends up
    // ringing silently, so wait for it instead and keep asking to be resumed —
    // the alarm starts the instant the audio hardware is back.
    if (c.state !== 'running') {
      kick();
      loopTimeout = setTimeout(fire, RETRY_MS);
      return;
    }

    const period = TONE_PLAYERS[wanted](c, c.destination, c.currentTime + LEAD_S);
    loopTimeout = setTimeout(fire, period * 1000);
  };
  fire();
}

/** Silences instantly — ramps every live gain to 0 rather than waiting out
 *  whatever decay was already scheduled for it. */
export function stopAlarmLoop(): void {
  wanted = null;
  if (loopTimeout !== null) {
    clearTimeout(loopTimeout);
    loopTimeout = null;
  }
  if (ctx) {
    const now = ctx.currentTime;
    for (const gain of activeGains) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
    }
  }
  activeGains = [];
}

let previewTimeout: ReturnType<typeof setTimeout> | null = null;

/** Plays one shot of a tone for about 2 seconds — the same synthesis code the
 *  live alarm loop uses, just not repeated. Used by the "Court bell" picker so
 *  choosing an alarm is also hearing it. */
export function previewTone(id: AlarmToneId): void {
  stopAlarmLoop();
  if (previewTimeout !== null) clearTimeout(previewTimeout);
  const c = getCtx();
  TONE_PLAYERS[id](c, c.destination, c.currentTime + LEAD_S);
  previewTimeout = setTimeout(() => {
    stopAlarmLoop();
    previewTimeout = null;
  }, 2000);
}

/** Test seam, matching the one in appUpdate.ts and sync.ts. */
export const __testing = {
  reset(): void {
    if (loopTimeout !== null) clearTimeout(loopTimeout);
    loopTimeout = null;
    wanted = null;
    if (previewTimeout !== null) clearTimeout(previewTimeout);
    previewTimeout = null;
    activeGains = [];
    ctx = null;
    if (typeof document !== 'undefined' && listening) {
      document.removeEventListener('pointerdown', kick, { capture: true });
      document.removeEventListener('visibilitychange', kick);
    }
    listening = false;
  },
};
