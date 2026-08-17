/**
 * Seven alarm tones, shipped as audio files in `public/alarms/`.
 *
 * They were synthesized from oscillators until the recordings arrived, and the
 * reason for that is still the constraint this file works under: the alarm has
 * to ring at a court with no signal. A synthesized tone could not fail to
 * arrive. A file can, so three things stand behind it.
 *
 * The default tone is precached, so a fresh install is never without one. Any
 * other tone is fetched the moment it is picked, which is also the moment it is
 * played, so choosing a tone is what puts it in the runtime cache. And starting
 * a timer loads whichever tone is set, minutes before the countdown could need
 * it. If all three somehow miss, `fallbackShot` still makes a noise — see it
 * below for why that is worth keeping.
 *
 * Everything plays through one AudioContext rather than an `<audio>` element,
 * which is what the iOS handling here depends on: the context is unlocked
 * inside the gesture that starts the timer, and the alarm the watchdog fires
 * later has no gesture of its own.
 */

export type AlarmToneId =
  | 'clear-announce'
  | 'double-beep'
  | 'musical-alert'
  | 'fairy-message'
  | 'marimba-ringtone'
  | 'police-whistle'
  | 'software-interface';

/** Precached, so every install has a working alarm before it picks one. */
export const DEFAULT_ALARM_TONE: AlarmToneId = 'clear-announce';

/** Named off the files they came from, in the order the picker lists them:
 *  the plainly alarming ones first, the ones with a character of their own after. */
export const ALARM_TONES: { id: AlarmToneId; label: string }[] = [
  { id: 'clear-announce', label: 'Clear Announce' },
  { id: 'double-beep', label: 'Double Beep' },
  { id: 'musical-alert', label: 'Musical Alert' },
  { id: 'fairy-message', label: 'Fairy Message' },
  { id: 'marimba-ringtone', label: 'Marimba Ringtone' },
  { id: 'police-whistle', label: 'Police Whistle' },
  { id: 'software-interface', label: 'Software Interface' },
];

/**
 * The five synthesized tones this replaced, mapped to their nearest recording.
 *
 * A host who set one of them has it stored in `pb-round-timer` and will still
 * be handed it after the update. `double-beep` is missing on purpose: the name
 * survived onto a real double beep, so it needs no translation.
 */
const LEGACY_TONES: Record<string, AlarmToneId> = {
  bell: 'clear-announce',
  'triple-chirp': 'musical-alert',
  whistle: 'police-whistle',
  buzzer: 'double-beep',
};

/**
 * A stored tone turned into one that can actually be played.
 *
 * Everything that reads a tone off the timer state goes through here, so a
 * value written by an older build, or by a future one that was rolled back, is
 * a sound rather than a silence.
 */
export function resolveTone(id: string): AlarmToneId {
  if (ALARM_TONES.some((tone) => tone.id === id)) return id as AlarmToneId;
  return LEGACY_TONES[id] ?? DEFAULT_ALARM_TONE;
}

function sourceUrl(id: AlarmToneId): string {
  return `/alarms/${id}.mp3`;
}

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

/**
 * Null where there is no Web Audio at all, rather than throwing.
 *
 * Every browser this app is used in has it. What does not is anything else that
 * loads the page — and the page a stranger loads by pointing a camera at a QR
 * code is exactly the one that must not go white because a sound could not be
 * arranged. Each caller below simply does nothing, which is the same outcome as
 * a phone on silent and needs no explaining to anybody.
 */
function getCtx(): AudioContext | null {
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null;
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

// ------------------------------------------------------------- the recordings --

/** Decoded and ready to play. Kept for the life of the page: the largest is a
 *  quarter of a megabyte decoded, and re-fetching one mid-alarm is the failure
 *  this whole file is arranged to avoid. */
const buffers = new Map<AlarmToneId, AudioBuffer>();
/** Fetches already in the air, so two callers asking at once make one request. */
const loads = new Map<AlarmToneId, Promise<AudioBuffer | null>>();

/**
 * Fetches and decodes one tone, or hands back the copy already decoded.
 *
 * Resolves to null rather than rejecting. Every caller here is on a path where
 * the alarm has to keep going regardless, so a failure is a fact to act on
 * rather than an error to propagate.
 */
function loadTone(id: AlarmToneId): Promise<AudioBuffer | null> {
  const ready = buffers.get(id);
  if (ready) return Promise.resolve(ready);

  const inFlight = loads.get(id);
  if (inFlight) return inFlight;

  const c = getCtx();
  // No Web Audio here at all. Nothing to decode into, and nothing that could
  // ever play it, so the fetch is not worth making either.
  if (!c) return Promise.resolve(null);
  const started = (async () => {
    try {
      const response = await fetch(sourceUrl(id));
      if (!response.ok) throw new Error(`${response.status} for ${sourceUrl(id)}`);
      const decoded = await c.decodeAudioData(await response.arrayBuffer());
      buffers.set(id, decoded);
      return decoded;
    } catch {
      // Offline with nothing cached, or an engine that will not decode this
      // file. Dropped from `loads` so the next ask is a fresh attempt rather
      // than this same failure remembered.
      loads.delete(id);
      return null;
    }
  })();

  loads.set(id, started);
  return started;
}

/**
 * Loads a tone ahead of needing it. Called when the timer starts, which is
 * both the user gesture that unlocks audio and the last quiet moment before
 * the countdown — by the time it ends the file has been in memory for minutes.
 */
export function preloadTone(id: AlarmToneId): void {
  void loadTone(resolveTone(id));
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
 *
 * The tone is optional only so a caller with nothing chosen yet can still
 * unlock the context. Pass one wherever there is one.
 */
export function warmUpAudio(tone?: AlarmToneId): void {
  const c = getCtx();
  if (!c) return;
  try {
    const source = c.createBufferSource();
    source.buffer = c.createBuffer(1, 1, c.sampleRate);
    source.connect(c.destination);
    source.start(0);
  } catch {
    // An older engine without createBuffer, or a context torn down underneath
    // us. The alarm's own retry below is the real safety net.
  }
  if (tone) preloadTone(tone);
}

// ---------------------------------------------------------------- playing it --

/** Everything currently sounding, so one stop can silence the lot at once
 *  instead of waiting out each one's own tail. */
let activeGains: GainNode[] = [];
let activeSources: AudioBufferSourceNode[] = [];

/**
 * How far ahead of the context's own clock anything is scheduled.
 *
 * A note booked at exactly `currentTime` is a race with the audio thread that
 * it sometimes loses, and one booked in the *past* is silence outright. 50ms is
 * inaudible as a delay and puts the whole thing safely in the future.
 */
const LEAD_S = 0.05;

/** How often to look again while waiting for a suspended context, or for a
 *  recording that is still decoding. */
const RETRY_MS = 250;

/**
 * How long the alarm will wait in silence for its recording before beeping on
 * its own instead.
 *
 * A file already in the cache is fetched and decoded in far less than this, so
 * the usual path never reaches the fallback at all. It is the difference
 * between an alarm that is a fraction late and one that is not an alarm.
 */
const FALLBACK_AFTER_MS = 1000;

/** How often the fallback repeats once it has taken over. */
const FALLBACK_PERIOD_MS = 1000;

/** How long a preview runs before cutting itself off. Every tone but the
 *  marimba is shorter than this and simply finishes. */
const PREVIEW_MAX_S = 5;

function drop<T>(list: T[], item: T): void {
  const i = list.indexOf(item);
  if (i !== -1) list.splice(i, 1);
}

/** Starts one recording, once or on repeat, tracked so `silence()` can cut it. */
function playBuffer(c: AudioContext, buffer: AudioBuffer, loop: boolean): void {
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  // A gain of its own rather than straight to the destination, so stopping has
  // something to ramp: cutting a source dead mid-waveform is an audible click.
  const gain = c.createGain();
  gain.gain.setValueAtTime(1, c.currentTime);

  source.connect(gain);
  gain.connect(c.destination);
  source.start(c.currentTime + LEAD_S);

  activeSources.push(source);
  activeGains.push(gain);
  source.addEventListener('ended', () => {
    drop(activeSources, source);
    drop(activeGains, gain);
  });
}

/** Cuts everything sounding, without touching whether an alarm is still wanted. */
function silence(): void {
  if (ctx) {
    const now = ctx.currentTime;
    for (const gain of activeGains) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
    }
    for (const source of activeSources) {
      try {
        source.stop(now);
      } catch {
        // Already stopped, or never started. Either way it is not sounding.
      }
    }
  }
  activeGains = [];
  activeSources = [];
}

/** One oscillator with a linear attack and an exponential decay. All that is
 *  left of the synthesized tones, and only the fallback below still uses it. */
function shot(
  c: AudioContext,
  startTime: number,
  freq: number,
  peak: number,
  attack: number,
  decay: number
): void {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startTime);
  osc.stop(startTime + attack + decay + 0.05);

  activeGains.push(gain);
  osc.addEventListener('ended', () => drop(activeGains, gain));
}

/**
 * A plain double beep, built from oscillators, for when the chosen recording is
 * not there to play.
 *
 * It should never be heard. Reaching it means the default tone missed the
 * precache, a chosen one missed the runtime cache, and the load at the start of
 * the round failed too. It is here because the thing this file exists to do is
 * make a noise when a round ends, and every other line above is about a file
 * that might not arrive. Silence is the one outcome not worth being tidy about.
 */
function fallbackShot(c: AudioContext, t: number): void {
  shot(c, t, 1000, 0.5, 0.01, 0.12);
  shot(c, t + 0.24, 1000, 0.5, 0.01, 0.12);
}

// ------------------------------------------------------------------ the loop --

let loopTimeout: ReturnType<typeof setTimeout> | null = null;
let previewTimeout: ReturnType<typeof setTimeout> | null = null;
/** The tone the alarm is meant to be playing, or null when it should be quiet. */
let wanted: AlarmToneId | null = null;
/** The tone a preview is waiting on, so a load that lands late knows whether
 *  anybody still wants it. */
let previewing: AlarmToneId | null = null;

/** Whether the alarm is meant to be sounding — including while it is waiting
 *  on a suspended context or a download, which is still an alarm. */
export function isAlarmLoopActive(): boolean {
  return wanted !== null;
}

export function startAlarmLoop(id: AlarmToneId): void {
  stopAlarmLoop();
  const tone = resolveTone(id);
  wanted = tone;
  const c = getCtx();
  // Silence, and `wanted` deliberately left unset: an alarm nothing can sound
  // is not an alarm waiting on a suspended context, and isAlarmLoopActive
  // saying otherwise would have the host's watchdog trying to restart it for
  // the rest of the round.
  if (!c) return;
  const startedAt = Date.now();
  void loadTone(tone);

  const fire = () => {
    if (wanted !== tone) return;

    // A phone that spent the round with its screen off hands back a context
    // whose clock is frozen. Scheduling into that is how an alarm ends up
    // ringing silently, so wait for it instead and keep asking to be resumed.
    if (c.state !== 'running') {
      kick();
      loopTimeout = setTimeout(fire, RETRY_MS);
      return;
    }

    const buffer = buffers.get(tone);
    if (buffer) {
      // The recording repeats itself, so there is nothing left to reschedule.
      // A context that suspends from here pauses the source and resumes it
      // where it left off, which is exactly what should happen.
      playBuffer(c, buffer, true);
      loopTimeout = null;
      return;
    }

    // Still on its way. Look again shortly rather than make a noise straight
    // away: a cached file is decoded well inside this window, and starting on
    // the wrong sound only to swap tones a moment later is worse than a pause.
    if (Date.now() - startedAt < FALLBACK_AFTER_MS) {
      loopTimeout = setTimeout(fire, RETRY_MS);
      return;
    }

    // Long enough. Beep on our own and keep asking for the recording, which
    // takes over from the next tick if it ever arrives.
    fallbackShot(c, c.currentTime + LEAD_S);
    void loadTone(tone);
    loopTimeout = setTimeout(fire, FALLBACK_PERIOD_MS);
  };

  fire();
}

/** Silences instantly, and stops any preview with it. */
export function stopAlarmLoop(): void {
  wanted = null;
  previewing = null;
  if (loopTimeout !== null) {
    clearTimeout(loopTimeout);
    loopTimeout = null;
  }
  if (previewTimeout !== null) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  silence();
}

/**
 * Plays one tone through once, up to five seconds. The same recording the live
 * alarm loops, just not repeated. Used by the tone picker, so choosing an alarm
 * is also hearing it.
 */
export function previewTone(id: AlarmToneId): void {
  const tone = resolveTone(id);
  stopAlarmLoop();
  previewing = tone;
  const c = getCtx();
  if (!c) return;

  const begin = (buffer: AudioBuffer) => {
    playBuffer(c, buffer, false);
    // Only the marimba is long enough to be cut short by this. The rest run out
    // on their own and the timeout just tidies up after them.
    previewTimeout = setTimeout(() => {
      silence();
      previewTimeout = null;
    }, Math.min(buffer.duration, PREVIEW_MAX_S) * 1000);
  };

  const ready = buffers.get(tone);
  if (ready) {
    begin(ready);
    return;
  }

  void loadTone(tone).then((buffer) => {
    // Somebody may have picked a different row, or started a real alarm, while
    // this was downloading. No fallback beep here: a preview exists to say what
    // a tone sounds like, and the wrong sound would be a worse answer than none.
    if (previewing !== tone || !buffer) return;
    begin(buffer);
  });
}

/** Test seam, matching the one in appUpdate.ts and sync.ts. */
export const __testing = {
  reset(): void {
    stopAlarmLoop();
    buffers.clear();
    loads.clear();
    ctx = null;
    if (typeof document !== 'undefined' && listening) {
      document.removeEventListener('pointerdown', kick, { capture: true });
      document.removeEventListener('visibilitychange', kick);
    }
    listening = false;
  },
};
