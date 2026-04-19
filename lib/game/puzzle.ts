import type { CountryRecord, DailyPuzzle, RoundProgress, StoredProgress } from "@/lib/types";

export const STORAGE_KEY = "edges:v1:progress";

export function getUtcDateId(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getCurrentPuzzleId(override?: string | null): string {
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return override;
  }

  return getUtcDateId(new Date());
}

export function createEmptyRounds(puzzle: DailyPuzzle): RoundProgress[] {
  return puzzle.countries.map((countryIso) => ({
    countryIso,
    found: [],
    wrong: [],
    misses: 0,
    hintCount: 0,
    solvedAt: null,
    skippedAt: null,
  }));
}

function normalizeRound(
  round: Partial<RoundProgress> | undefined,
  countryIso: string,
): RoundProgress {
  return {
    countryIso,
    found: Array.isArray(round?.found) ? round!.found : [],
    wrong: Array.isArray(round?.wrong) ? round!.wrong : [],
    misses: typeof round?.misses === "number" ? round.misses : 0,
    hintCount: typeof round?.hintCount === "number" ? round.hintCount : 0,
    solvedAt: typeof round?.solvedAt === "string" ? round.solvedAt : null,
    skippedAt: typeof round?.skippedAt === "string" ? round.skippedAt : null,
  };
}

function normalizeStoredProgress(
  progress: Partial<StoredProgress>,
  puzzle: DailyPuzzle,
): StoredProgress {
  return {
    puzzleId: typeof progress.puzzleId === "string" ? progress.puzzleId : puzzle.id,
    rounds: puzzle.countries.map((countryIso, index) =>
      normalizeRound(progress.rounds?.[index], countryIso),
    ),
    completed: Boolean(progress.completed),
    streak: typeof progress.streak === "number" ? progress.streak : 0,
    maxStreak: typeof progress.maxStreak === "number" ? progress.maxStreak : 0,
    sharedAt: typeof progress.sharedAt === "string" ? progress.sharedAt : null,
    completedAt: typeof progress.completedAt === "string" ? progress.completedAt : null,
  };
}

export function createEmptyProgress(
  puzzle: DailyPuzzle,
  carryStreak = 0,
  maxStreak = 0,
): StoredProgress {
  return {
    puzzleId: puzzle.id,
    rounds: createEmptyRounds(puzzle),
    completed: false,
    streak: carryStreak,
    maxStreak,
    sharedAt: null,
    completedAt: null,
  };
}

export function isPreviousUtcDay(previous: string, next: string): boolean {
  const previousDate = new Date(`${previous}T00:00:00.000Z`);
  const nextDate = new Date(`${next}T00:00:00.000Z`);
  return nextDate.getTime() - previousDate.getTime() === 24 * 60 * 60 * 1000;
}

export function hydrateProgress(
  rawValue: string | null,
  puzzle: DailyPuzzle,
): StoredProgress {
  if (!rawValue) {
    return createEmptyProgress(puzzle);
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredProgress>;
    if (parsed.puzzleId === puzzle.id) {
      return normalizeStoredProgress(parsed, puzzle);
    }

    const carriedStreak =
      parsed.completed &&
      typeof parsed.puzzleId === "string" &&
      isPreviousUtcDay(parsed.puzzleId, puzzle.id)
        ? (parsed.streak ?? 0)
        : 0;

    return createEmptyProgress(
      puzzle,
      carriedStreak,
      Math.max(parsed.maxStreak ?? 0, parsed.streak ?? 0),
    );
  } catch {
    return createEmptyProgress(puzzle);
  }
}

export function getPuzzleById(
  puzzles: DailyPuzzle[],
  puzzleId: string,
): DailyPuzzle {
  const match = puzzles.find((puzzle) => puzzle.id === puzzleId);
  if (match) {
    return match;
  }

  return puzzles[puzzles.length - 1];
}

export function getActiveRoundIndex(progress: StoredProgress): number {
  return progress.rounds.findIndex((round) => !round.solvedAt);
}

export function isRoundSolved(
  round: RoundProgress,
  countriesByIso: Record<string, CountryRecord>,
): boolean {
  const expected = countriesByIso[round.countryIso]?.neighbors.length ?? 0;
  return round.found.length >= expected;
}
