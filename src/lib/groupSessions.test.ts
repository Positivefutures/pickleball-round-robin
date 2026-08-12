/**
 * @vitest-environment happy-dom
 *
 * Parking one group's afternoon and picking another one up.
 *
 * The property worth pinning is that nothing is lost in either direction. A host
 * who steps across to another group and back must find the schedule, the scores,
 * the couples and the court count exactly as they left them, and the group they
 * stepped across to must not inherit any of it.
 *
 * The second property is quieter and costs more when it breaks: the live slot
 * and the active group must never disagree. Everything downstream reads the live
 * slot and takes it for the active group's, so a switch that moved one without
 * the other would show one group's name over another group's session.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Schedule } from '../types';
import * as stores from './stores';
import { park, resume, switchToGroup, forget, forgetAll, currentStep } from './groupSessions';

/** A schedule shaped just enough to be recognised again. */
function scheduleNamed(name: string): Schedule {
  return {
    rounds: [
      {
        roundNumber: 1,
        type: 'standard',
        courts: [
          {
            courtNumber: 1,
            team1: [{ id: name, name, rating: 4, gender: 'M', rosterIds: ['g1'] }],
            team2: [],
          },
        ],
        sitOuts: [],
      },
    ],
  } as unknown as Schedule;
}

/**
 * Every store this file touches, put back to its opening value.
 *
 * Clearing localStorage is not enough on its own. A store's set() reads the
 * value it is updating from its cache rather than from storage while nothing is
 * subscribed to it, so a functional set after a bare clear would spread the last
 * test's value back over the top. In the app that cannot happen: App subscribes
 * to all of these for as long as it is mounted, and nothing wipes storage
 * underneath it.
 */
beforeEach(() => {
  window.localStorage.clear();
  stores.rosters.set([
    { id: 'g1', name: 'Riverside Club' },
    { id: 'g2', name: 'Tuesday Crew' },
  ]);
  stores.activeRosterId.set('g1');
  stores.groupSessions.set({});
  stores.schedule.set(null);
  stores.scheduleRosterId.set(null);
  stores.scheduleEdited.set(false);
  stores.completedRounds.set([]);
  stores.selectedIds.set([]);
  stores.removedIds.set([]);
  stores.partnerships.set([]);
  stores.guests.set([]);
  stores.sessionId.set(null);
  stores.shareKey.set(null);
  stores.numCourts.set(3);
  stores.numRounds.set(8);
  stores.scoringEnabled.set(false);
  stores.step.set('roster');
  stores.setupSeen.set(false);
});

describe('parking a group and coming back to it', () => {
  it('gives back the session, the settings and the tab', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    stores.completedRounds.set([1, 2]);
    stores.selectedIds.set(['p1', 'p2']);
    stores.partnerships.set([{ player1Id: 'p1', player2Id: 'p2' }]);
    stores.numCourts.set(4);
    stores.numRounds.set(9);
    stores.scoringEnabled.set(true);
    stores.step.set('schedule');
    stores.setupSeen.set(true);

    switchToGroup('g2');
    switchToGroup('g1');

    expect(stores.schedule.get()).toEqual(scheduleNamed('riverside'));
    expect(stores.completedRounds.get()).toEqual([1, 2]);
    expect(stores.selectedIds.get()).toEqual(['p1', 'p2']);
    expect(stores.partnerships.get()).toEqual([{ player1Id: 'p1', player2Id: 'p2' }]);
    expect(stores.numCourts.get()).toBe(4);
    expect(stores.numRounds.get()).toBe(9);
    expect(stores.scoringEnabled.get()).toBe(true);
    expect(currentStep()).toBe('schedule');
    expect(stores.setupSeen.get()).toBe(true);
  });

  it('keeps two groups apart, each with its own session', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    stores.numCourts.set(4);

    switchToGroup('g2');
    stores.schedule.set(scheduleNamed('tuesday'));
    stores.numCourts.set(2);

    switchToGroup('g1');
    expect(stores.schedule.get()).toEqual(scheduleNamed('riverside'));
    expect(stores.numCourts.get()).toBe(4);

    switchToGroup('g2');
    expect(stores.schedule.get()).toEqual(scheduleNamed('tuesday'));
    expect(stores.numCourts.get()).toBe(2);
  });

  it('points the saved session at the group it was filed under', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    stores.scheduleRosterId.set('g1');

    switchToGroup('g2');
    // No session over there, so nothing claims to have built one.
    expect(stores.scheduleRosterId.get()).toBeNull();

    switchToGroup('g1');
    expect(stores.scheduleRosterId.get()).toBe('g1');
  });

  it('moves the active group with the slot, never one without the other', () => {
    stores.schedule.set(scheduleNamed('riverside'));

    switchToGroup('g2');

    expect(stores.activeRosterId.get()).toBe('g2');
    expect(stores.schedule.get()).toBeNull();
  });
});

describe('a group nobody has set up yet', () => {
  it('opens empty, with the numbers already in use', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    stores.selectedIds.set(['p1']);
    stores.partnerships.set([{ player1Id: 'p1', player2Id: 'p2' }]);
    stores.numCourts.set(4);
    stores.numRounds.set(9);
    stores.scoringEnabled.set(true);
    stores.step.set('schedule');
    stores.setupSeen.set(true);

    switchToGroup('g2');

    expect(stores.schedule.get()).toBeNull();
    expect(stores.selectedIds.get()).toEqual([]);
    expect(stores.partnerships.get()).toEqual([]);
    expect(currentStep()).toBe('roster');
    expect(stores.setupSeen.get()).toBe(false);
    // Inherited rather than reset. Whoever is switching has just been running a
    // session, and it is usually the same club with the same booking.
    expect(stores.numCourts.get()).toBe(4);
    expect(stores.numRounds.get()).toBe(9);
    expect(stores.scoringEnabled.get()).toBe(true);
  });

  it('takes the guests with the session and leaves none behind', () => {
    stores.guests.set([
      { id: 'guest1', name: 'Visitor', rating: 4, gender: 'M', rosterIds: [] },
    ]);

    switchToGroup('g2');
    expect(stores.guests.get()).toEqual([]);

    switchToGroup('g1');
    expect(stores.guests.get()).toHaveLength(1);
  });
});

describe('the tab a group is left on', () => {
  it('refuses a saved schedule tab with no schedule under it', () => {
    stores.step.set('schedule');
    stores.schedule.set(null);

    expect(currentStep()).toBe('roster');
  });

  it('files the tab it can draw, not the one it was told', () => {
    stores.step.set('schedule');
    stores.schedule.set(null);

    park('g1');
    switchToGroup('g2');
    switchToGroup('g1');

    expect(stores.step.get()).toBe('roster');
  });
});

describe('a group that is going', () => {
  it('leaves nothing behind for a group of the same name to inherit', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    park('g1');
    expect(stores.groupSessions.get()).toHaveProperty('g1');

    forget('g1');
    expect(stores.groupSessions.get()).not.toHaveProperty('g1');

    // And what is left over is still whole.
    stores.schedule.set(scheduleNamed('tuesday'));
    park('g2');
    forgetAll();
    expect(stores.groupSessions.get()).toEqual({});
  });
});

describe('a session being shared live', () => {
  it('is stopped on the way out rather than pointed at another group', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    stores.shareKey.set('abc123');

    switchToGroup('g2');

    // liveSession publishes whatever is in the live slot under the key it is
    // holding, so a key that survived the switch would push the incoming group's
    // scores out to the outgoing group's QR code.
    expect(stores.shareKey.get()).toBeNull();
  });

  it('does not come back with the group it belonged to', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    stores.shareKey.set('abc123');

    switchToGroup('g2');
    switchToGroup('g1');

    expect(stores.schedule.get()).toEqual(scheduleNamed('riverside'));
    expect(stores.shareKey.get()).toBeNull();
  });
});

describe('resuming a group directly', () => {
  it('is what a delete leaves behind, and it fills the slot', () => {
    stores.schedule.set(scheduleNamed('riverside'));
    park('g1');
    switchToGroup('g2');
    stores.schedule.set(scheduleNamed('tuesday'));

    // The shape of handleDeleteRoster: the group going is forgotten, the active
    // id moves on, and the group taking its place is opened rather than left
    // with the deleted group's session in the slot.
    forget('g2');
    stores.activeRosterId.set('g1');
    resume('g1');

    expect(stores.schedule.get()).toEqual(scheduleNamed('riverside'));
  });
});
