export type DifficultyBand = "easy" | "medium" | "hard";

export interface CountryRecord {
  iso3: string;
  name: string;
  aliases: string[];
  neighbors: string[];
  bbox: [number, number, number, number];
  centroid: [number, number];
  difficultyBand: DifficultyBand;
  playable: boolean;
  neighborCount: number;
  region: string;
  subregion: string;
}

export interface DailyPuzzle {
  id: string;
  dateUTC: string;
  countries: [string, string, string];
}

export interface RoundProgress {
  countryIso: string;
  found: string[];
  wrong: string[];
  misses: number;
  hintCount: number;
  solvedAt: string | null;
  skippedAt: string | null;
}

export interface StoredProgress {
  puzzleId: string;
  rounds: RoundProgress[];
  completed: boolean;
  streak: number;
  maxStreak: number;
  sharedAt: string | null;
  completedAt: string | null;
}

export interface GuessResult {
  kind:
    | "correct"
    | "wrong"
    | "duplicate_found"
    | "duplicate_wrong"
    | "invalid_country";
  iso3: string | null;
}

export interface RenderGameState {
  puzzleId: string;
  activeRound: number;
  activeCountry: string;
  activeCountryIso: string;
  expectedNeighbors: string[];
  foundNeighbors: string[];
  visibleFoundNeighbors: string[];
  misses: number;
  hintCount: number;
  skipped: boolean;
  completed: boolean;
  streak: number;
  maxStreak: number;
  message: string | null;
  celebrationStep: number | null;
  awaitingContinue: boolean;
}
