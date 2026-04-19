import { aliasToIso, countriesByIso, dailyPuzzles } from "@/lib/data";
import { applyGuessToProgress, classifyGuess } from "@/lib/game/guess";
import { normalizeCountryName } from "@/lib/game/normalize";
import {
  createEmptyProgress,
  getPuzzleById,
  getUtcDateId,
  hydrateProgress,
  isPreviousUtcDay,
} from "@/lib/game/puzzle";
import { formatShareText } from "@/lib/game/share";

describe("country normalization", () => {
  it("normalizes punctuation and accents", () => {
    expect(normalizeCountryName("Côte d'Ivoire")).toBe("cote d ivoire");
  });

  it("resolves canonical names and aliases", () => {
    expect(aliasToIso[normalizeCountryName("Germany")]).toBe("DEU");
    expect(aliasToIso[normalizeCountryName("United States of America")]).toBe("USA");
    expect(aliasToIso[normalizeCountryName("DR Congo")]).toBe("COD");
  });
});

describe("guess classification", () => {
  it("tracks wrong guesses once and ignores duplicates", () => {
    const puzzle = getPuzzleById(dailyPuzzles, "2026-04-03");
    const progress = createEmptyProgress(puzzle);
    const round = progress.rounds[0];

    const wrongGuess = classifyGuess("Brazil", round, countriesByIso, aliasToIso);
    expect(wrongGuess.kind).toBe("wrong");

    const afterWrong = applyGuessToProgress(progress, 0, wrongGuess, countriesByIso);
    const duplicateWrong = classifyGuess("Brazil", afterWrong.rounds[0], countriesByIso, aliasToIso);

    expect(afterWrong.rounds[0].misses).toBe(1);
    expect(duplicateWrong.kind).toBe("duplicate_wrong");
  });

  it("preserves the order correct neighbors were guessed", () => {
    const puzzle = getPuzzleById(dailyPuzzles, "2026-04-03");
    const progress = createEmptyProgress(puzzle);
    const round = progress.rounds[0];
    const country = countriesByIso[round.countryIso];
    const [firstGuess, secondGuess] = [...country.neighbors].reverse();

    const afterFirst = applyGuessToProgress(
      progress,
      0,
      classifyGuess(countriesByIso[firstGuess].name, round, countriesByIso, aliasToIso),
      countriesByIso,
    );
    const afterSecond = applyGuessToProgress(
      afterFirst,
      0,
      classifyGuess(
        countriesByIso[secondGuess].name,
        afterFirst.rounds[0],
        countriesByIso,
        aliasToIso,
      ),
      countriesByIso,
    );

    expect(afterSecond.rounds[0].found).toEqual([firstGuess, secondGuess]);
  });

  it("completes a round only when all neighbors are found", () => {
    const puzzle = getPuzzleById(dailyPuzzles, "2026-04-03");
    const progress = createEmptyProgress(puzzle);
    const round = progress.rounds[1];
    const country = countriesByIso[round.countryIso];

    let current = progress;
    for (const neighbor of country.neighbors.slice(0, -1)) {
      current = applyGuessToProgress(
        current,
        1,
        classifyGuess(countriesByIso[neighbor].name, current.rounds[1], countriesByIso, aliasToIso),
        countriesByIso,
      );
    }

    expect(current.rounds[1].solvedAt).toBeNull();

    current = applyGuessToProgress(
      current,
      1,
      classifyGuess(
        countriesByIso[country.neighbors[country.neighbors.length - 1]].name,
        current.rounds[1],
        countriesByIso,
        aliasToIso,
      ),
      countriesByIso,
    );

    expect(current.rounds[1].solvedAt).not.toBeNull();
  });
});

describe("puzzle hydration and sharing", () => {
  it("changes exactly at UTC date boundaries", () => {
    expect(getUtcDateId(new Date("2026-04-03T23:59:59.999Z"))).toBe("2026-04-03");
    expect(getUtcDateId(new Date("2026-04-04T00:00:00.000Z"))).toBe("2026-04-04");
    expect(isPreviousUtcDay("2026-04-03", "2026-04-04")).toBe(true);
  });

  it("carries streak from a completed previous day", () => {
    const yesterdayPuzzle = getPuzzleById(dailyPuzzles, "2026-04-03");
    const todayPuzzle = getPuzzleById(dailyPuzzles, "2026-04-04");
    const yesterdayProgress = {
      ...createEmptyProgress(yesterdayPuzzle),
      completed: true,
      streak: 5,
      maxStreak: 5,
    };

    const hydrated = hydrateProgress(JSON.stringify(yesterdayProgress), todayPuzzle);

    expect(hydrated.puzzleId).toBe("2026-04-04");
    expect(hydrated.streak).toBe(5);
    expect(hydrated.maxStreak).toBe(5);
  });

  it("migrates older saved progress to include hint and skip defaults", () => {
    const puzzle = getPuzzleById(dailyPuzzles, "2026-04-04");
    const legacyProgress = {
      puzzleId: puzzle.id,
      rounds: puzzle.countries.map((countryIso) => ({
        countryIso,
        found: [],
        wrong: [],
        misses: 0,
        solvedAt: null,
      })),
      completed: false,
      streak: 0,
      maxStreak: 0,
      sharedAt: null,
      completedAt: null,
    };

    const hydrated = hydrateProgress(JSON.stringify(legacyProgress), puzzle);

    expect(hydrated.rounds.every((round) => round.hintCount === 0)).toBe(true);
    expect(hydrated.rounds.every((round) => round.skippedAt === null)).toBe(true);
  });

  it("formats spoiler-free share text", () => {
    const puzzle = getPuzzleById(dailyPuzzles, "2026-04-03");
    const progress = createEmptyProgress(puzzle);
    progress.rounds[0].hintCount = 1;
    progress.rounds[1].found = [...countriesByIso[progress.rounds[1].countryIso].neighbors];
    progress.rounds[1].skippedAt = "2026-04-03T01:00:00.000Z";
    progress.rounds[1].solvedAt = "2026-04-03T01:00:00.000Z";
    const share = formatShareText(progress, countriesByIso);

    expect(share).toContain("Edges 2026-04-03");
    expect(share).not.toContain(countriesByIso[puzzle.countries[0]].name);
    expect(share).toContain("R1");
    expect(share).toContain("💡");
    expect(share).toContain("❌");
  });
});
