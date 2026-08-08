import type { Partnership, Player, Roster, Schedule } from '../types';

/**
 * Combining what is on this device with what is already on the account.
 *
 * Pure, and separate from the engine, for the same reason planImport() is: this
 * is the fiddly part, it is where data would be lost, and it deserves to be
 * tested without a React tree or a network in the way.
 *
 * The rule that does the real work is **id adoption**. When a local group or
 * player is recognised as one the account already holds, the local copy takes
 * on the account's id rather than keeping its own. After that both devices
 * refer to the same person by the same id forever, so every later sync is an
 * ordinary idempotent upsert. Without it, merging twice would make two of
 * everything, and nothing else in the design would save you.
 *
 * Matching is by id first, then by name. Id is the stronger evidence: two rows
 * with the same id are the same row, whatever they are called now. Name is the
 * fallback, case- and padding-insensitive, exactly the key planImport() builds.
 *
 * Where the two sides disagree, the account wins. It keeps its name, its rating
 * and its gender, mirroring the rule the file import already ships: a name
 * already in the pool keeps what it has. The one thing that is not a contest is
 * group membership, which is unioned, because being in a group is not an
 * opinion about a player that two devices can hold differently.
 */

export interface Snapshot {
  rosters: Roster[];
  players: Player[];
}

/** Local id to adopted account id, for everything that referred to the old one. */
export interface IdChanges {
  rosters: Record<string, string>;
  players: Record<string, string>;
}

export interface MergePlan {
  /** The lists this device should hold once the merge is applied. */
  rosters: Roster[];
  players: Player[];
  changes: IdChanges;
  /** Rows the account does not have, or does not have in full, so must be sent. */
  push: Snapshot;
  /** Names that were on both sides and collapsed into one, for the report. */
  matched: { rosters: string[]; players: string[] };
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function planMerge(local: Snapshot, server: Snapshot): MergePlan {
  // ------------------------------------------------------------- the groups --

  const rosterById = new Map(server.rosters.map((r) => [r.id, r]));
  const rosterByName = new Map(server.rosters.map((r) => [key(r.name), r]));

  const rosterChanges: Record<string, string> = {};
  const matchedRosters: string[] = [];
  const rosters: Roster[] = [];
  const pushRosters: Roster[] = [];
  const adopted = new Set<string>();

  // Local order first, so the device's own list does not rearrange itself under
  // someone who was only trying to sign in. The account's extras follow.
  for (const mine of local.rosters) {
    const theirs = rosterById.get(mine.id) ?? rosterByName.get(key(mine.name));

    if (!theirs) {
      rosters.push(mine);
      pushRosters.push(mine);
      continue;
    }

    if (mine.id !== theirs.id) rosterChanges[mine.id] = theirs.id;
    // Two local groups can answer to one on the account. They fold together
    // rather than appearing twice, which is the same thing id adoption does for
    // players.
    if (!adopted.has(theirs.id)) {
      adopted.add(theirs.id);
      rosters.push(theirs);
      matchedRosters.push(theirs.name);
    }
  }

  for (const theirs of server.rosters) {
    if (!adopted.has(theirs.id)) rosters.push(theirs);
  }

  // ------------------------------------------------------------ the players --

  const playerById = new Map(server.players.map((p) => [p.id, p]));
  const playerByName = new Map(server.players.map((p) => [key(p.name), p]));

  const playerChanges: Record<string, string> = {};
  const matchedPlayers: string[] = [];
  const players: Player[] = [];
  const pushPlayers: Player[] = [];
  /** Account id to the merged copy sitting in `players`, so a second local match extends it. */
  const merged = new Map<string, Player>();
  /** Merged copies that gained a group, so the account has to be told. */
  const widened = new Set<string>();

  for (const mine of local.players) {
    // Group ids are rewritten before anything is compared. A local player who
    // belongs to a group that just adopted the account's id belongs to the
    // account's group, and saying so later would be too late.
    const mineRosterIds = unique(mine.rosterIds.map((id) => rosterChanges[id] ?? id));
    const theirs = playerById.get(mine.id) ?? playerByName.get(key(mine.name));

    if (!theirs) {
      const moved = { ...mine, rosterIds: mineRosterIds };
      players.push(moved);
      pushPlayers.push(moved);
      continue;
    }

    if (mine.id !== theirs.id) playerChanges[mine.id] = theirs.id;

    let copy = merged.get(theirs.id);
    if (!copy) {
      copy = { ...theirs, rosterIds: unique(theirs.rosterIds) };
      merged.set(theirs.id, copy);
      players.push(copy);
      matchedPlayers.push(theirs.name);
    }

    const before = copy.rosterIds.length;
    copy.rosterIds = unique([...copy.rosterIds, ...mineRosterIds]);
    if (copy.rosterIds.length !== before) widened.add(copy.id);
  }

  for (const theirs of server.players) {
    if (!merged.has(theirs.id)) players.push(theirs);
  }

  for (const player of players) {
    if (widened.has(player.id)) pushPlayers.push(player);
  }

  return {
    rosters,
    players,
    changes: { rosters: rosterChanges, players: playerChanges },
    push: { rosters: pushRosters, players: pushPlayers },
    matched: { rosters: matchedRosters, players: matchedPlayers }
  };
}

// ------------------------------------------------------------- the session --

/**
 * The device-local state that refers to a group or a player by id.
 *
 * Adopting the account's ids would otherwise quietly break a session that is
 * already under way: the schedule would still draw, because it holds whole
 * player objects, but fixed partnerships would stop applying and the sat-out
 * list would read as empty. Nothing would look wrong, which is the worst kind
 * of wrong.
 */
export interface SessionRefs {
  activeRosterId: string;
  scheduleRosterId: string | null;
  schedule: Schedule | null;
  selectedIds: string[];
  removedIds: string[];
  partnerships: Partnership[];
}

export function remapSession(session: SessionRefs, changes: IdChanges): SessionRefs {
  const roster = (id: string) => changes.rosters[id] ?? id;
  const player = (id: string) => changes.players[id] ?? id;

  const remapPlayer = (p: Player): Player => ({
    ...p,
    id: player(p.id),
    rosterIds: unique(p.rosterIds.map(roster))
  });

  return {
    activeRosterId: roster(session.activeRosterId),
    scheduleRosterId: session.scheduleRosterId === null ? null : roster(session.scheduleRosterId),
    schedule: session.schedule && {
      ...session.schedule,
      rounds: session.schedule.rounds.map((round) => ({
        ...round,
        courts: round.courts.map((court) => ({
          ...court,
          team1: court.team1.map(remapPlayer),
          team2: court.team2.map(remapPlayer)
        })),
        sitOuts: round.sitOuts.map(remapPlayer)
      }))
    },
    selectedIds: unique(session.selectedIds.map(player)),
    removedIds: unique(session.removedIds.map(player)),
    partnerships: session.partnerships.map((pair) => ({
      player1Id: player(pair.player1Id),
      player2Id: player(pair.player2Id)
    }))
  };
}
