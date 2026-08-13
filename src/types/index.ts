export type Gender = 'M' | 'F';

export interface Roster {
  id: string;
  name: string;
}

export interface Player {
  id: string;
  name: string;
  rating: number; // 3.0 - 5.0
  gender: Gender;
  rosterIds: string[]; // a player may belong to any number of rosters
  /**
   * Set on somebody playing this session who is not in the group. They live in
   * the guests store rather than the player pool, and they go when the session
   * does. Optional, so every other player is untouched by it, and absent from
   * both the sync row and the group file because those list their fields out.
   */
  guest?: true;
}

export interface SessionConfig {
  attendingPlayerIds: string[];
  numCourts: number; // 1+
  numRounds: number;
}

/** A finished game, as the host wrote it down. Both sides always present. */
export interface CourtScore {
  team1: number;
  team2: number;
}

export interface CourtAssignment {
  courtNumber: number;
  team1: Player[];
  team2: Player[];
  ratingDiff: number;
  /**
   * What was played here, once somebody has entered it. Absent until then, and
   * absent again once it is cleared. Never `{ team1: 0, team2: 0 }` standing in
   * for "no score", because 0-0 is a score somebody could mean.
   *
   * It sits on the court because a court has no stable id of its own.
   * `courtNumber` is the host's to rename and a court's index shifts when one is
   * added or taken back, so a score keyed on either would come unstuck by
   * teatime. Here it is carried by the object it belongs to, through every
   * operation that already spreads that object.
   */
  score?: CourtScore;
}

// The three formats a round can be played in, on top of the ordinary round
// robin. A round is at most one of them.
export type RoundType = 'gendered' | 'mixed' | 'skill';

export interface SpecialTypeSetting {
  enabled: boolean;
  /** Play this type on round 1 and every N rounds after. */
  frequency: number;
  /**
   * Where the host has placed this type in the panel, 0 first. Settles which
   * type takes a round two of them both fall due on.
   */
  order: number;
}

export type SpecialGameTypes = Record<RoundType, SpecialTypeSetting>;

export interface Round {
  roundNumber: number;
  courts: CourtAssignment[];
  sitOuts: Player[];
  roundType?: RoundType;
  /**
   * Written by versions that only knew about gendered rounds. Schedules saved
   * before this field became `roundType` still carry it, so read rounds through
   * `roundTypeOf` rather than either field directly.
   */
  isGendered?: boolean;
}

export interface Schedule {
  rounds: Round[];
}

export interface LockedPair {
  player1Id: string;
  player2Id: string;
  courtIdx: number;
  team: 'team1' | 'team2';
}

// A fixed partnership set up during Setup. Unlike LockedPair, it is
// placement-agnostic: the two players are kept on the same team every round,
// but the scheduler is free to choose which court and which opponents they get.
export interface Partnership {
  player1Id: string;
  player2Id: string;
}

export interface PairingHistory {
  partnerCounts: Record<string, Record<string, number>>;
  opponentCounts: Record<string, Record<string, number>>;
  sitOutCounts: Record<string, number>;
  gamesPlayed: Record<string, number>;
  /**
   * How many games on a court the roster could not fill a player has had — a
   * 2v1 or a game of singles. Fewest goes first, so a roster that never divides
   * by four passes the short game round rather than parking it on the same
   * three people all afternoon.
   */
  shortGameCounts: Record<string, number>;
  /**
   * Per type, how many rounds of that type a player has missed out on — they
   * sat out, or the roster only stretched to so many special courts and they
   * got an ordinary one. Whoever has missed most goes first next time.
   */
  specialMissCounts: Record<RoundType, Record<string, number>>;
  /**
   * On a night of partner play, how many times each pair of fixed teams has met.
   * Keyed by the two team keys, so it survives a reshuffle: the round robin
   * reads the lowest count off here to know which fixtures are still owed.
   * Empty on every other kind of session.
   */
  teamMatchCounts: Record<string, number>;
}
