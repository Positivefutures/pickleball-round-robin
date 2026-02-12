export type Gender = 'M' | 'F';

export interface Player {
  id: string;
  name: string;
  rating: number; // 3.0 - 5.0
  gender: Gender;
}

export interface SessionConfig {
  attendingPlayerIds: string[];
  numCourts: number; // 2-5
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
}

export interface Schedule {
  rounds: Round[];
}

export interface PairingHistory {
  partnerCounts: Record<string, Record<string, number>>;
  opponentCounts: Record<string, Record<string, number>>;
  sitOutCounts: Record<string, number>;
  gamesPlayed: Record<string, number>;
}
