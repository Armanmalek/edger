import { normalizeCountryName } from "@/lib/game/normalize";
import type {
  CountryRecord,
  GuessResult,
  RoundProgress,
  StoredProgress,
} from "@/lib/types";

export function resolveCountryGuess(
  value: string,
  aliasToIso: Record<string, string>,
): string | null {
  const normalized = normalizeCountryName(value);
  return aliasToIso[normalized] ?? null;
}

export function classifyGuess(
  value: string,
  round: RoundProgress,
  countriesByIso: Record<string, CountryRecord>,
  aliasToIso: Record<string, string>,
): GuessResult {
  const iso3 = resolveCountryGuess(value, aliasToIso);
  if (!iso3) {
    return { kind: "invalid_country", iso3: null };
  }

  if (round.found.includes(iso3)) {
    return { kind: "duplicate_found", iso3 };
  }

  if (round.wrong.includes(iso3)) {
    return { kind: "duplicate_wrong", iso3 };
  }

  const expected = countriesByIso[round.countryIso]?.neighbors ?? [];
  if (expected.includes(iso3)) {
    return { kind: "correct", iso3 };
  }

  return { kind: "wrong", iso3 };
}

export function applyGuessToProgress(
  progress: StoredProgress,
  roundIndex: number,
  guess: GuessResult,
  countriesByIso: Record<string, CountryRecord>,
): StoredProgress {
  const rounds = progress.rounds.map((round, index) => {
    if (index !== roundIndex) {
      return round;
    }

    if (!guess.iso3) {
      return round;
    }

    if (guess.kind === "correct") {
      const nextFound = [...round.found, guess.iso3].sort((left, right) =>
        countriesByIso[left].name.localeCompare(countriesByIso[right].name),
      );
      const solved = nextFound.length === countriesByIso[round.countryIso].neighbors.length;
      return {
        ...round,
        found: nextFound,
        solvedAt: solved ? new Date().toISOString() : round.solvedAt,
      };
    }

    if (guess.kind === "wrong") {
      return {
        ...round,
        wrong: [...round.wrong, guess.iso3],
        misses: round.misses + 1,
      };
    }

    return round;
  });

  return {
    ...progress,
    rounds,
  };
}
