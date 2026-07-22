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

export interface Round {
  roundNumber: number;
  courts: CourtAssignment[];
  sitOuts: Player[];
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
  genderedMixedCounts: Record<string, number>;
}
