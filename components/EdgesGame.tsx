"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { countriesByIso, countryRecords, dailyPuzzles, aliasToIso } from "@/lib/data";
import { applyGuessToProgress, classifyGuess } from "@/lib/game/guess";
import {
  createEmptyProgress,
  getActiveRoundIndex,
  getCurrentPuzzleId,
  getPuzzleById,
  hydrateProgress,
  STORAGE_KEY,
} from "@/lib/game/puzzle";
import { formatShareText } from "@/lib/game/share";
import type { CountryRecord, RenderGameState, RoundProgress, StoredProgress } from "@/lib/types";
import { EdgesMap } from "@/components/EdgesMap";
import styles from "./edges-game.module.css";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
  }
}

const TRANSITION_MS = 3000;
const CELEBRATION_STEP_MS = 280;
const CELEBRATION_FINAL_HOLD_MS = 900;

interface CelebrationState {
  roundIndex: number;
  priorFound: string[];
  finalIso: string;
  step: number;
}

interface HintEntry {
  iso3: string;
  text: string;
}

function formatPuzzleLabel(puzzleId: string) {
  const date = new Date(`${puzzleId}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getMatchingSuggestions(inputValue: string) {
  const query = inputValue.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return countryRecords
    .map((country) => {
      const values = [country.name, ...country.aliases];
      const startsWith = values.some((value) => value.toLowerCase().startsWith(query));
      const includes = values.some((value) => value.toLowerCase().includes(query));
      return {
        country,
        rank: startsWith ? 0 : includes ? 1 : 2,
      };
    })
    .filter((item) => item.rank < 2)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.country.name.localeCompare(right.country.name);
    })
    .map((item) => item.country)
    .slice(0, 7);
}

function getRoundMessage(resultKind: string) {
  switch (resultKind) {
    case "correct":
      return "Border found.";
    case "wrong":
      return "Not a land border.";
    case "duplicate_found":
      return "Already found.";
    case "duplicate_wrong":
      return "Already tried.";
    default:
      return "Choose a recognized country name.";
  }
}

function getLetterCount(name: string) {
  return name.replace(/[^A-Za-z]/g, "").length;
}

function getCompassDirection(
  from: CountryRecord["centroid"],
  to: CountryRecord["centroid"],
): string {
  const [fromLon, fromLat] = from;
  const [toLon, toLat] = to;
  const deltaX = toLon - fromLon;
  const deltaY = toLat - fromLat;
  const angle = (Math.atan2(deltaX, deltaY) * 180) / Math.PI;
  const normalized = (angle + 360) % 360;
  const directions = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
  ];

  return directions[Math.round(normalized / 45) % directions.length] ?? "north";
}

function getHintEntries(
  country: CountryRecord,
  round: RoundProgress,
  countries: Record<string, CountryRecord>,
): HintEntry[] {
  return country.neighbors.map((neighborIso, index) => {
    const neighbor = countries[neighborIso];
    const letterCount = getLetterCount(neighbor.name);
    const direction = getCompassDirection(country.centroid, neighbor.centroid);
    const firstLetter = neighbor.name[0]?.toUpperCase() ?? "?";
    const clueNumber = index + 1;
    const foundState = round.found.includes(neighborIso) ? " Already found." : "";

    return {
      iso3: neighborIso,
      text: `Hint ${clueNumber}: ${direction} of ${country.name}, starts with ${firstLetter}, ${letterCount} letters.${foundState}`,
    };
  });
}

function finalizeCompletion(progress: StoredProgress): StoredProgress {
  if (progress.completed) {
    return progress;
  }

  const nextStreak = progress.rounds.some((round) => round.skippedAt)
    ? progress.streak
    : progress.streak + 1;
  return {
    ...progress,
    completed: true,
    streak: nextStreak,
    maxStreak: Math.max(progress.maxStreak, nextStreak),
    completedAt: new Date().toISOString(),
  };
}

function getDisplayRoundIndex(progress: StoredProgress): number {
  const activeIndex = getActiveRoundIndex(progress);
  return activeIndex === -1 ? progress.rounds.length - 1 : activeIndex;
}

function getRenderState(
  progress: StoredProgress,
  roundIndex: number,
  message: string | null,
  visibleFoundNeighbors: string[],
  celebrationStep: number | null,
): RenderGameState {
  const activeRound = progress.rounds[Math.min(roundIndex, progress.rounds.length - 1)];
  const activeCountry = countriesByIso[activeRound.countryIso];
  return {
    puzzleId: progress.puzzleId,
    activeRound: roundIndex,
    activeCountry: activeCountry.name,
    activeCountryIso: activeCountry.iso3,
    expectedNeighbors: activeCountry.neighbors.map((iso3) => countriesByIso[iso3].name),
    foundNeighbors: activeRound.found.map((iso3) => countriesByIso[iso3].name),
    visibleFoundNeighbors: visibleFoundNeighbors.map((iso3) => countriesByIso[iso3].name),
    misses: activeRound.misses,
    hintCount: activeRound.hintCount,
    skipped: Boolean(activeRound.skippedAt),
    completed: progress.completed,
    streak: progress.streak,
    maxStreak: progress.maxStreak,
    message,
    celebrationStep,
  };
}

export function EdgesGame() {
  const searchParams = useSearchParams();
  const forcedDate = searchParams.get("date");
  const puzzleId = getCurrentPuzzleId(forcedDate);
  const puzzle = getPuzzleById(dailyPuzzles, puzzleId);

  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgress] = useState<StoredProgress>(() => createEmptyProgress(puzzle));
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [celebrationState, setCelebrationState] = useState<CelebrationState | null>(null);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);

  const activeRound = progress.rounds[currentRoundIndex];
  const activeCountry = countriesByIso[activeRound.countryIso];
  const hintEntries = useMemo(
    () => getHintEntries(activeCountry, activeRound, countriesByIso),
    [activeCountry, activeRound],
  );
  const revealedHints = hintEntries.slice(0, activeRound.hintCount);
  const hasRemainingHints = activeRound.hintCount < hintEntries.length;
  const suggestions = useMemo(
    () =>
      getMatchingSuggestions(inputValue).filter(
        (country) => country.iso3 !== activeCountry.iso3 && !activeRound.found.includes(country.iso3),
      ),
    [activeCountry.iso3, activeRound.found, inputValue],
  );
  const isCelebrating = celebrationState?.roundIndex === currentRoundIndex;
  const visibleFoundNeighbors = useMemo(() => {
    if (!isCelebrating || !celebrationState) {
      return activeRound.found;
    }

    const finalIsVisible = celebrationState.step > celebrationState.priorFound.length;
    return finalIsVisible
      ? [...celebrationState.priorFound, celebrationState.finalIso]
      : celebrationState.priorFound;
  }, [activeRound.found, celebrationState, isCelebrating]);
  const completeNeighbors = useMemo(() => {
    if (!isCelebrating || !celebrationState) {
      return [];
    }

    const completedPrior = celebrationState.priorFound.slice(
      0,
      Math.min(celebrationState.step, celebrationState.priorFound.length),
    );
    const finalNeighbor =
      celebrationState.step > celebrationState.priorFound.length ? [celebrationState.finalIso] : [];

    return [...completedPrior, ...finalNeighbor];
  }, [celebrationState, isCelebrating]);
  const correctNeighbors = useMemo(() => {
    if (!isCelebrating || !celebrationState) {
      return activeRound.found;
    }

    return celebrationState.priorFound.slice(
      Math.min(celebrationState.step, celebrationState.priorFound.length),
    );
  }, [activeRound.found, celebrationState, isCelebrating]);
  const celebratingIso = useMemo(() => {
    if (!isCelebrating || !celebrationState || celebrationState.step === 0) {
      return null;
    }

    if (celebrationState.step <= celebrationState.priorFound.length) {
      return celebrationState.priorFound[celebrationState.step - 1] ?? null;
    }

    return celebrationState.finalIso;
  }, [celebrationState, isCelebrating]);
  const remainingCount = activeCountry.neighbors.length - activeRound.found.length;
  const showCompletePanel = progress.completed && !isCelebrating;

  useEffect(() => {
    const storedValue =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const nextProgress = hydrateProgress(storedValue, puzzle);
    setProgress(nextProgress);
    setCurrentRoundIndex(getDisplayRoundIndex(nextProgress));
    setInputValue("");
    setMessage(null);
    setShareState("idle");
    setCelebrationState(null);
    setHighlightedSuggestion(0);
    setHydrated(true);
  }, [puzzle.id]);

  useEffect(() => {
    setHighlightedSuggestion(0);
  }, [inputValue, currentRoundIndex]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [hydrated, progress]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.render_game_to_text = () =>
      JSON.stringify(
        getRenderState(
          progress,
          currentRoundIndex,
          message,
          visibleFoundNeighbors,
          celebrationState?.step ?? null,
        ),
      );
    window.advanceTime = (ms: number) =>
      new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });

    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [celebrationState?.step, currentRoundIndex, message, progress, visibleFoundNeighbors]);

  useEffect(() => {
    if (!celebrationState) {
      return;
    }

    const maxStep = celebrationState.priorFound.length + 1;

    if (celebrationState.step < maxStep) {
      const timer = window.setTimeout(() => {
        setCelebrationState((current) =>
          current && current.roundIndex === celebrationState.roundIndex
            ? {
                ...current,
                step: Math.min(current.step + 1, maxStep),
              }
            : current,
        );
      }, CELEBRATION_STEP_MS);

      return () => window.clearTimeout(timer);
    }

    const elapsedSequenceMs = maxStep * CELEBRATION_STEP_MS;
    const holdMs = Math.max(CELEBRATION_FINAL_HOLD_MS, TRANSITION_MS - elapsedSequenceMs);
    const timer = window.setTimeout(() => {
      if (progress.completed) {
        setCelebrationState(null);
        return;
      }

      const nextRound = getActiveRoundIndex(progress);
      if (nextRound >= 0) {
        setCurrentRoundIndex(nextRound);
      }
      setCelebrationState(null);
      setMessage("Next border set.");
    }, holdMs);

    return () => window.clearTimeout(timer);
  }, [celebrationState, progress]);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(formatShareText(progress, countriesByIso));
      const nextProgress = {
        ...progress,
        sharedAt: new Date().toISOString(),
      };
      setProgress(nextProgress);
      setShareState("copied");
      setMessage("Share result copied.");
    } catch {
      setShareState("failed");
      setMessage("Clipboard was unavailable.");
    }
  }

  function applyRoundUpdate(nextRound: RoundProgress, messageText: string) {
    const nextProgress = {
      ...progress,
      rounds: progress.rounds.map((round, index) => (index === currentRoundIndex ? nextRound : round)),
    };
    const finalProgress =
      currentRoundIndex === nextProgress.rounds.length - 1
        ? finalizeCompletion(nextProgress)
        : nextProgress;

    setProgress(finalProgress);
    setInputValue("");
    setHighlightedSuggestion(0);
    setMessage(messageText);

    if (currentRoundIndex < finalProgress.rounds.length - 1) {
      const nextRoundIndex = getActiveRoundIndex(finalProgress);
      if (nextRoundIndex >= 0) {
        setCurrentRoundIndex(nextRoundIndex);
      }
    }
  }

  function handleHint() {
    if (progress.completed || isCelebrating || !hasRemainingHints) {
      return;
    }

    const nextHintCount = activeRound.hintCount + 1;
    const nextRound = {
      ...activeRound,
      hintCount: nextHintCount,
    };
    setProgress({
      ...progress,
      rounds: progress.rounds.map((round, index) =>
        index === currentRoundIndex ? nextRound : round,
      ),
    });
    setMessage(hintEntries[nextHintCount - 1]?.text ?? "No more hints for this round.");
  }

  function handleSkip() {
    if (progress.completed || isCelebrating || activeRound.solvedAt) {
      return;
    }

    const now = new Date().toISOString();
    applyRoundUpdate(
      {
        ...activeRound,
        found: [...activeCountry.neighbors],
        solvedAt: now,
        skippedAt: now,
      },
      currentRoundIndex === progress.rounds.length - 1
        ? "Round skipped. Daily route closed."
        : "Round skipped. Next border set.",
    );
  }

  function submitGuess(rawGuess: string) {
    if (!rawGuess.trim() || progress.completed || isCelebrating) {
      return;
    }

    const result = classifyGuess(rawGuess, activeRound, countriesByIso, aliasToIso);
    setMessage(getRoundMessage(result.kind));

    if (result.kind === "invalid_country") {
      return;
    }

    const nextProgress = applyGuessToProgress(
      progress,
      currentRoundIndex,
      result,
      countriesByIso,
    );
    const nextRound = nextProgress.rounds[currentRoundIndex];
    const solved =
      nextRound.found.length === countriesByIso[nextRound.countryIso].neighbors.length;

    if (result.kind === "correct" && solved) {
      const finalProgress =
        currentRoundIndex === nextProgress.rounds.length - 1
          ? finalizeCompletion(nextProgress)
          : nextProgress;
      const orderedFound = nextRound.found;
      setProgress(finalProgress);
      setCelebrationState({
        roundIndex: currentRoundIndex,
        priorFound: orderedFound.slice(0, -1),
        finalIso: orderedFound[orderedFound.length - 1]!,
        step: 0,
      });
      setInputValue("");
      setHighlightedSuggestion(0);
      setMessage(currentRoundIndex === nextProgress.rounds.length - 1 ? "Solved." : "Round cleared.");
      return;
    }

    setProgress(nextProgress);
    setInputValue("");
    setHighlightedSuggestion(0);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitGuess(inputValue);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSuggestion((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSuggestion((current) =>
        current === 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Tab") {
      setInputValue(suggestions[highlightedSuggestion]?.name ?? inputValue);
      setHighlightedSuggestion(0);
      return;
    }

    if (event.key === "Enter" && inputValue.trim()) {
      event.preventDefault();
      submitGuess(suggestions[highlightedSuggestion]?.name ?? inputValue);
    }
  }

  function handleSuggestionPick(value: string) {
    setInputValue(value);
    setHighlightedSuggestion(0);
    submitGuess(value);
  }

  const routeStatus = progress.rounds.map((round, index) => ({
    label: index + 1,
    complete: Boolean(round.solvedAt),
    active: index === currentRoundIndex && (!progress.completed || isCelebrating),
  }));

  return (
    <main className={styles.page}>
      <section className={styles.poster}>
        <div className={styles.brandRow}>
          <div>
            <p className={styles.kicker}>Edges</p>
            <h1 className={styles.title}>Trace every border before midnight UTC.</h1>
          </div>
          <div className={styles.dateBlock}>
            <span className={styles.dateLabel}>Daily puzzle</span>
            <strong>{formatPuzzleLabel(progress.puzzleId)}</strong>
          </div>
        </div>

        <div className={styles.mapPanel}>
          <div className={styles.mapSurface}>
            <EdgesMap
              activeCountryIso={activeCountry.iso3}
              correctNeighbors={correctNeighbors}
              completeNeighbors={completeNeighbors}
              celebratingIso={celebratingIso}
            />
          </div>

          <aside className={styles.controlRail}>
            <div className={styles.routeRow} aria-label="Daily route status">
              {routeStatus.map((item) => (
                <span
                  key={item.label}
                  className={styles.routeChip}
                  data-active={item.active}
                  data-complete={item.complete}
                >
                  {item.label}
                </span>
              ))}
            </div>

            <div className={styles.roundMeta}>
              <p className={styles.roundLabel}>
                Round {Math.min(currentRoundIndex + 1, 3)} of 3
              </p>
              <h2 className={styles.countryName}>{activeCountry.name}</h2>
              <p className={styles.helper}>
                Find all {activeCountry.neighbors.length} land borders one by one.
              </p>
            </div>

            <dl className={styles.stats}>
              <div>
                <dt>Remaining</dt>
                <dd data-testid="remaining-count">{remainingCount}</dd>
              </div>
              <div>
                <dt>Misses</dt>
                <dd data-testid="miss-count">{activeRound.misses}</dd>
              </div>
              <div>
                <dt>Streak</dt>
                <dd>{progress.streak}</dd>
              </div>
            </dl>

            {!showCompletePanel ? (
              <form className={styles.guessForm} onSubmit={handleSubmit}>
                <label className={styles.label} htmlFor="country-guess">
                  Enter a neighboring country
                </label>
                <div className={styles.inputStack}>
                  <input
                    id="country-guess"
                    autoComplete="off"
                    className={styles.input}
                    data-testid="country-input"
                    disabled={progress.completed || isCelebrating}
                    onChange={(event) => setInputValue(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Type a country"
                    value={inputValue}
                  />
                  <div className={styles.suggestionViewport}>
                    {suggestions.length > 0 ? (
                      <div className={styles.suggestionTray} data-testid="suggestion-list">
                        {suggestions.map((country, index) => (
                          <button
                            key={country.iso3}
                            className={styles.suggestion}
                            data-active={index === highlightedSuggestion}
                            disabled={progress.completed || isCelebrating}
                            onClick={() => handleSuggestionPick(country.name)}
                            onMouseEnter={() => setHighlightedSuggestion(index)}
                            type="button"
                          >
                            <span>{country.name}</span>
                            <span className={styles.suggestionMeta}>{country.region}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  className={styles.submit}
                  data-testid="submit-guess"
                  disabled={progress.completed || isCelebrating}
                  type="submit"
                >
                  Submit
                </button>
                <div className={styles.actionRow}>
                  <button
                    className={styles.secondaryAction}
                    data-testid="hint-button"
                    disabled={progress.completed || isCelebrating || !hasRemainingHints}
                    onClick={handleHint}
                    type="button"
                  >
                    {hasRemainingHints ? "Use hint" : "No hints left"}
                  </button>
                  <button
                    className={styles.skipAction}
                    data-testid="skip-button"
                    disabled={progress.completed || isCelebrating}
                    onClick={handleSkip}
                    type="button"
                  >
                    Skip round
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.completePanel}>
                <p className={styles.completeTitle}>Daily route complete.</p>
                <p className={styles.helper}>Three countries cleared. Come back after 00:00 UTC.</p>
                <button className={styles.submit} data-testid="share-button" onClick={handleShare} type="button">
                  {shareState === "copied" ? "Copied" : "Share result"}
                </button>
              </div>
            )}

            <p
              aria-live="polite"
              className={styles.feedback}
              data-tone={message === "Not a land border." ? "danger" : "neutral"}
              data-testid="feedback"
            >
              {message ?? " "}
            </p>

            <section className={styles.foundSection}>
              <div className={styles.foundHeader}>
                <h3>Found borders</h3>
                <span>{activeRound.found.length}</span>
              </div>
              <ul className={styles.foundList} data-testid="found-list">
                {activeRound.found.map((iso3) => (
                  <li key={iso3}>{countriesByIso[iso3].name}</li>
                ))}
              </ul>
            </section>

            {!showCompletePanel && revealedHints.length > 0 ? (
              <section className={styles.hintSection}>
                <div className={styles.foundHeader}>
                  <h3>Hints used</h3>
                  <span>{revealedHints.length}</span>
                </div>
                <ul className={styles.hintList} data-testid="hint-list">
                  {revealedHints.map((hint) => (
                    <li key={hint.iso3}>{hint.text}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {showCompletePanel ? (
              <section className={styles.summary}>
                <h3>Today’s result</h3>
                <pre className={styles.shareBlock}>{formatShareText(progress, countriesByIso)}</pre>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}
