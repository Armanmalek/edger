"use client";

import { useEffect, useState } from "react";
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
import type { RenderGameState, StoredProgress } from "@/lib/types";
import { EdgesMap } from "@/components/EdgesMap";
import styles from "./edges-game.module.css";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
  }
}

const TRANSITION_MS = 3000;

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

function finalizeCompletion(progress: StoredProgress): StoredProgress {
  if (progress.completed) {
    return progress;
  }

  const nextStreak = progress.streak + 1;
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
    misses: activeRound.misses,
    completed: progress.completed,
    streak: progress.streak,
    maxStreak: progress.maxStreak,
    message,
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
  const [celebrationRound, setCelebrationRound] = useState<number | null>(null);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);

  const activeRound = progress.rounds[currentRoundIndex];
  const activeCountry = countriesByIso[activeRound.countryIso];
  const remainingCount = activeCountry.neighbors.length - activeRound.found.length;
  const suggestions = getMatchingSuggestions(inputValue).filter(
    (country) => country.iso3 !== activeCountry.iso3 && !activeRound.found.includes(country.iso3),
  );
  const isCelebrating = celebrationRound === currentRoundIndex;

  useEffect(() => {
    const storedValue =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const nextProgress = hydrateProgress(storedValue, puzzle);
    setProgress(nextProgress);
    setCurrentRoundIndex(getDisplayRoundIndex(nextProgress));
    setInputValue("");
    setMessage(null);
    setShareState("idle");
    setCelebrationRound(null);
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
      JSON.stringify(getRenderState(progress, currentRoundIndex, message));
    window.advanceTime = (ms: number) =>
      new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });

    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [currentRoundIndex, message, progress]);

  useEffect(() => {
    if (celebrationRound === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (progress.completed) {
        setCelebrationRound(null);
        return;
      }

      const nextRound = getActiveRoundIndex(progress);
      if (nextRound >= 0) {
        setCurrentRoundIndex(nextRound);
      }
      setCelebrationRound(null);
      setMessage("Next border set.");
    }, TRANSITION_MS);

    return () => window.clearTimeout(timer);
  }, [celebrationRound, progress]);

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
      setProgress(finalProgress);
      setCelebrationRound(currentRoundIndex);
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
    active: index === currentRoundIndex && !progress.completed,
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
              foundNeighbors={activeRound.found}
              celebration={isCelebrating}
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

            {!progress.completed ? (
              <form className={styles.guessForm} onSubmit={handleSubmit}>
                <label className={styles.label} htmlFor="country-guess">
                  Enter a neighboring country
                </label>
                <input
                  id="country-guess"
                  autoComplete="off"
                  className={styles.input}
                  data-testid="country-input"
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a country"
                  value={inputValue}
                />
                {suggestions.length > 0 ? (
                  <div className={styles.suggestionTray} data-testid="suggestion-list">
                    {suggestions.map((country, index) => (
                      <button
                        key={country.iso3}
                        className={styles.suggestion}
                        data-active={index === highlightedSuggestion}
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
                <button className={styles.submit} data-testid="submit-guess" type="submit">
                  Submit
                </button>
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

            {progress.completed ? (
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
