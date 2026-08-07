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
}

export interface SessionConfig {
  attendingPlayerIds: string[];
  numCourts: number; // 1+
  numRounds: number;
}

export interface CourtAssignment {
  courtNumber: number;
  team1: Player[];
  team2: Player[];
  ratingDiff: number;
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
   * Per type, how many rounds of that type a player has missed out on — they
   * sat out, or the roster only stretched to so many special courts and they
   * got an ordinary one. Whoever has missed most goes first next time.
   */
  specialMissCounts: Record<RoundType, Record<string, number>>;
}
