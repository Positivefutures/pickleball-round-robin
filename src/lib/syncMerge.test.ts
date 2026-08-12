import { describe, it, expect } from 'vitest';
import { planMerge, remapSession, remapParked } from './syncMerge';
import type { Snapshot } from './syncMerge';
import type { Player, Roster, Schedule } from '../types';

function roster(id: string, name: string): Roster {
  return { id, name };
}

function player(id: string, name: string, rosterIds: string[], rating = 4): Player {
  return { id, name, rating, gender: 'M', rosterIds };
}

function snapshot(rosters: Roster[], players: Player[]): Snapshot {
  return { rosters, players };
}

const empty = snapshot([], []);

describe('planMerge', () => {
  it('keeps both sides when nothing matches', () => {
    const plan = planMerge(
      snapshot([roster('L', 'Monday')], [player('lp', 'Ana', ['L'])]),
      snapshot([roster('S', 'Friday')], [player('sp', 'Ben', ['S'])])
    );

    expect(plan.rosters.map((r) => r.name)).toEqual(['Monday', 'Friday']);
    expect(plan.players.map((p) => p.name)).toEqual(['Ana', 'Ben']);
    // Only what the account is missing goes up.
    expect(plan.push.rosters.map((r) => r.id)).toEqual(['L']);
    expect(plan.push.players.map((p) => p.id)).toEqual(['lp']);
    expect(plan.matched).toEqual({ rosters: [], players: [] });
  });

  it('adopts the account id for a group of the same name, and rewrites who is in it', () => {
    const plan = planMerge(
      snapshot([roster('local-id', 'Tuesday Night')], [player('lp', 'Ana', ['local-id'])]),
      snapshot([roster('server-id', 'tuesday night ')], [])
    );

    // Id adoption is the whole mechanism. Without it, merging twice makes two
    // of everything.
    expect(plan.rosters).toEqual([roster('server-id', 'tuesday night ')]);
    expect(plan.changes.rosters).toEqual({ 'local-id': 'server-id' });
    expect(plan.players[0].rosterIds).toEqual(['server-id']);
    // The group already exists up there, so only the player is new.
    expect(plan.push.rosters).toEqual([]);
    expect(plan.push.players.map((p) => p.rosterIds)).toEqual([['server-id']]);
    expect(plan.matched.rosters).toEqual(['tuesday night ']);
  });

  it('collapses one person held on both sides into a single row', () => {
    const plan = planMerge(
      snapshot([roster('r', 'Group')], [player('mine', ' ANA ', ['r'], 3.5)]),
      snapshot([roster('r', 'Group')], [player('theirs', 'Ana', ['r'], 4.5)])
    );

    expect(plan.players).toHaveLength(1);
    expect(plan.players[0].id).toBe('theirs');
    // The account keeps what it has, exactly as a file import does.
    expect(plan.players[0].rating).toBe(4.5);
    expect(plan.players[0].name).toBe('Ana');
    expect(plan.changes.players).toEqual({ mine: 'theirs' });
    expect(plan.matched.players).toEqual(['Ana']);
  });

  it('unions group membership rather than letting one side win it', () => {
    const plan = planMerge(
      snapshot([roster('a', 'A'), roster('b', 'B')], [player('mine', 'Ana', ['a', 'b'])]),
      snapshot([roster('a', 'A'), roster('c', 'C')], [player('theirs', 'Ana', ['a', 'c'])])
    );

    expect(plan.players[0].rosterIds).toEqual(['a', 'c', 'b']);
    // The account does not know about group B yet, so this row has to go up.
    expect(plan.push.players.map((p) => p.id)).toEqual(['theirs']);
  });

  it('sends nothing for a person the account already has in full', () => {
    const both = snapshot([roster('r', 'Group')], [player('p', 'Ana', ['r'])]);
    const plan = planMerge(both, both);

    expect(plan.push).toEqual({ rosters: [], players: [] });
  });

  it('prefers a matching id over a matching name, so a rename is not a new person', () => {
    const plan = planMerge(
      snapshot([roster('r', 'Group')], [player('p', 'Annabel', ['r'])]),
      snapshot(
        [roster('r', 'Group')],
        [player('p', 'Ana', ['r']), player('other', 'Annabel', ['r'])]
      )
    );

    // The local row is the account's 'p' under a name it has since been given
    // elsewhere. Matching the name instead would fold two different people.
    expect(plan.changes.players).toEqual({});
    expect(plan.players.map((p) => p.id)).toEqual(['p', 'other']);
  });

  it('folds two local groups that answer to one on the account', () => {
    const plan = planMerge(
      snapshot(
        [roster('l1', 'Tuesday'), roster('l2', ' tuesday')],
        [player('a', 'Ana', ['l1']), player('b', 'Ben', ['l2'])]
      ),
      snapshot([roster('s', 'Tuesday')], [])
    );

    expect(plan.rosters).toHaveLength(1);
    expect(plan.changes.rosters).toEqual({ l1: 's', l2: 's' });
    expect(plan.players.every((p) => p.rosterIds.join() === 's')).toBe(true);
  });

  it('seeds an empty account with everything, under the ids this device holds', () => {
    const local = snapshot([roster('r', 'Group')], [player('p', 'Ana', ['r'])]);
    const plan = planMerge(local, empty);

    expect(plan.rosters).toEqual(local.rosters);
    expect(plan.players).toEqual(local.players);
    expect(plan.push).toEqual(local);
    expect(plan.changes).toEqual({ rosters: {}, players: {} });
  });

  it('takes the whole account when the device has nothing of its own', () => {
    const server = snapshot([roster('r', 'Group')], [player('p', 'Ana', ['r'])]);
    const plan = planMerge(empty, server);

    expect(plan.rosters).toEqual(server.rosters);
    expect(plan.players).toEqual(server.players);
    expect(plan.push).toEqual({ rosters: [], players: [] });
  });

  it('settles down: merging the result again changes nothing and sends nothing', () => {
    const local = snapshot(
      [roster('l', 'Monday'), roster('shared-local', 'Tuesday')],
      [player('lp', 'Ana', ['l', 'shared-local']), player('dup', 'Ben', ['shared-local'])]
    );
    const server = snapshot(
      [roster('shared-server', 'Tuesday'), roster('s', 'Friday')],
      [player('bp', 'Ben', ['s'])]
    );

    const first = planMerge(local, server);
    // What the account looks like afterwards: everything it had, plus what was
    // pushed to it.
    const after = snapshot(
      [...server.rosters, ...first.push.rosters],
      [
        ...server.players.map((p) => first.players.find((q) => q.id === p.id) ?? p),
        ...first.push.players.filter((p) => !server.players.some((q) => q.id === p.id))
      ]
    );

    const second = planMerge({ rosters: first.rosters, players: first.players }, after);

    expect(second.push).toEqual({ rosters: [], players: [] });
    expect(second.changes).toEqual({ rosters: {}, players: {} });
    expect(second.players.map((p) => p.id).sort()).toEqual(first.players.map((p) => p.id).sort());
  });
});

// --------------------------------------------------------------------------

describe('remapSession', () => {
  const changes = { rosters: { old_r: 'new_r' }, players: { old_p: 'new_p' } };

  const schedule: Schedule = {
    rounds: [
      {
        roundNumber: 1,
        courts: [
          {
            courtNumber: 1,
            team1: [player('old_p', 'Ana', ['old_r']), player('keep', 'Ben', ['old_r'])],
            team2: [player('x', 'Cal', [])],
            ratingDiff: 0
          }
        ],
        sitOuts: [player('old_p', 'Ana', ['old_r'])]
      }
    ]
  };

  it('follows every reference an adopted id leaves behind', () => {
    const next = remapSession(
      {
        activeRosterId: 'old_r',
        scheduleRosterId: 'old_r',
        schedule,
        selectedIds: ['old_p', 'keep'],
        removedIds: ['old_p'],
        partnerships: [{ player1Id: 'old_p', player2Id: 'keep' }]
      },
      changes
    );

    expect(next.activeRosterId).toBe('new_r');
    expect(next.scheduleRosterId).toBe('new_r');
    expect(next.selectedIds).toEqual(['new_p', 'keep']);
    expect(next.removedIds).toEqual(['new_p']);
    expect(next.partnerships).toEqual([{ player1Id: 'new_p', player2Id: 'keep' }]);

    const court = next.schedule!.rounds[0].courts[0];
    expect(court.team1.map((p) => p.id)).toEqual(['new_p', 'keep']);
    expect(court.team1[0].rosterIds).toEqual(['new_r']);
    expect(next.schedule!.rounds[0].sitOuts[0].id).toBe('new_p');
  });

  it('leaves a device with no session alone', () => {
    const bare = {
      activeRosterId: 'keep',
      scheduleRosterId: null,
      schedule: null,
      selectedIds: [],
      removedIds: [],
      partnerships: []
    };
    expect(remapSession(bare, changes)).toEqual(bare);
  });

  /**
   * The groups the host is not looking at need the same treatment, key included.
   * A parked session that kept the old ids would draw its schedule perfectly and
   * silently stop applying its couples, which is the failure remapSession exists
   * to prevent, one Tuesday later.
   */
  describe('remapParked', () => {
    const parked = {
      old_r: {
        schedule,
        selectedIds: ['old_p', 'keep'],
        removedIds: ['old_p'],
        partnerships: [{ player1Id: 'old_p', player2Id: 'keep' }],
        numCourts: 4
      },
      untouched: {
        schedule: null,
        selectedIds: ['keep'],
        removedIds: [],
        partnerships: [],
        numCourts: 2
      }
    };

    it('refiles a group under its adopted id, with its references followed', () => {
      const next = remapParked(parked, changes);

      expect(Object.keys(next).sort()).toEqual(['new_r', 'untouched']);
      expect(next.new_r.selectedIds).toEqual(['new_p', 'keep']);
      expect(next.new_r.partnerships).toEqual([{ player1Id: 'new_p', player2Id: 'keep' }]);
      expect(next.new_r.schedule!.rounds[0].courts[0].team1[0].id).toBe('new_p');
      expect(next.new_r.schedule!.rounds[0].courts[0].team1[0].rosterIds).toEqual(['new_r']);
      // Everything the merge has no opinion about rides along untouched.
      expect(next.new_r.numCourts).toBe(4);
      expect(next.untouched).toEqual(parked.untouched);
    });

    it('has nothing to say about a device with one group', () => {
      expect(remapParked({}, changes)).toEqual({});
    });
  });
});
