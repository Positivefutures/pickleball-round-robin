/**
 * @vitest-environment happy-dom
 *
 * Whose alarm it is.
 *
 * The host sets one for a court, so every phone watching starts on their
 * choices — that is the default, and it is the right one: somebody on the far
 * side of two courts should hear the end of the round. What it must not be is
 * the rule. Nine phones sounding at once around one net is nine times the alarm
 * anybody asked for, and the person holding each of them is the only one who
 * knows whether theirs should be one of the nine.
 *
 * So each of the three is answerable on the phone, each independently, and only
 * for the session it was answered during.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { alertsFor, ownAlerts, setOwnAlert } from './watchAlerts';
import * as stores from './stores';
import type { SharedRoundTimer } from './sessionSnapshot';

const SESSION = 'sess-today';

/** A timer as the host publishes one, with their three alerts on it. */
function hostTimer(over: Partial<SharedRoundTimer> = {}): SharedRoundTimer {
  return {
    roundNumber: 1,
    phase: 'running',
    endsAt: Date.now() + 60_000,
    remainingMs: 0,
    flashOn: true,
    soundOn: true,
    alarmTone: 'police-whistle',
    ...over
  };
}

beforeEach(() => {
  window.localStorage.clear();
  stores.watchAlerts.set(null);
});

describe('a phone nobody has touched the switches on', () => {
  it('does exactly what the host asked for', () => {
    expect(alertsFor(hostTimer(), SESSION)).toEqual({
      soundOn: true,
      flashOn: true,
      alarmTone: 'police-whistle'
    });
  });

  it('follows the host turning their own alarm off, too', () => {
    const quiet = alertsFor(hostTimer({ soundOn: false, flashOn: false }), SESSION);
    expect(quiet.soundOn).toBe(false);
    expect(quiet.flashOn).toBe(false);
  });

  /**
   * Sessions published before a watcher had any of this carry a flash flag and
   * neither of the other two. Reading the absence as silence would take the
   * sound away from everybody watching a host on an older build.
   */
  it('starts from the host defaults on a document written before these existed', () => {
    const older: SharedRoundTimer = {
      roundNumber: 1, phase: 'running', endsAt: Date.now() + 1000, remainingMs: 0, flashOn: true
    };
    expect(alertsFor(older, SESSION)).toEqual({
      soundOn: true,
      flashOn: true,
      alarmTone: 'clear-announce'
    });
  });

  it('lands on something audible when the host published a tone this build never had', () => {
    const got = alertsFor(hostTimer({ alarmTone: 'theremin-from-2029' }), SESSION);
    expect(got.alarmTone).toBe('clear-announce');
  });
});

describe('a watcher who has answered for themselves', () => {
  it('is not made to listen to an alarm the host switched on', () => {
    setOwnAlert(SESSION, { soundOn: false });

    expect(alertsFor(hostTimer({ soundOn: true }), SESSION).soundOn).toBe(false);
  });

  it('can have the sound the host switched off', () => {
    setOwnAlert(SESSION, { soundOn: true });

    expect(alertsFor(hostTimer({ soundOn: false }), SESSION).soundOn).toBe(true);
  });

  it('keeps following the host on everything they did not answer', () => {
    setOwnAlert(SESSION, { soundOn: false });

    // Turning the sound down is not a decision about the flash, and it must not
    // freeze the tone at whatever it happened to be either: the host may pick a
    // different one mid-session, and this phone should still be on it.
    const withHost = alertsFor(hostTimer({ flashOn: false, alarmTone: 'double-beep' }), SESSION);
    expect(withHost.flashOn).toBe(false);
    expect(withHost.alarmTone).toBe('double-beep');
  });

  it('can answer all three, and each one stands', () => {
    setOwnAlert(SESSION, { soundOn: true });
    setOwnAlert(SESSION, { flashOn: false });
    setOwnAlert(SESSION, { alarmTone: 'marimba-ringtone' });

    expect(alertsFor(hostTimer({ soundOn: false, flashOn: true }), SESSION)).toEqual({
      soundOn: true,
      flashOn: false,
      alarmTone: 'marimba-ringtone'
    });
  });

  it('survives the page being reloaded, since it is a whole afternoon', () => {
    setOwnAlert(SESSION, { soundOn: false });

    // What a reload does: nothing in memory, everything in storage.
    expect(window.localStorage.getItem('pb-watch-alerts')).toContain('sess-today');
    expect(ownAlerts(SESSION).soundOn).toBe(false);
  });
});

describe('the next session', () => {
  it('starts from the host again, rather than from last time', () => {
    setOwnAlert(SESSION, { soundOn: false, flashOn: false });

    // A different code, a different afternoon, quite possibly a different host.
    // "For the rest of the session" is the promise; forever is not.
    expect(alertsFor(hostTimer(), 'sess-next-tuesday')).toEqual({
      soundOn: true,
      flashOn: true,
      alarmTone: 'police-whistle'
    });
  });

  it('replaces the old record rather than merging into it', () => {
    setOwnAlert(SESSION, { soundOn: false, flashOn: false });
    setOwnAlert('sess-next-tuesday', { flashOn: false });

    const held = stores.watchAlerts.get();
    expect(held?.session).toBe('sess-next-tuesday');
    // The old session's silence must not follow somebody into a new one just
    // because they touched a different switch.
    expect(held?.soundOn).toBeUndefined();
  });
});
