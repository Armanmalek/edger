import type { CountryRecord, RoundProgress, StoredProgress } from "@/lib/types";
import { hr } from "framer-motion/client";

const ROUND_SYMBOL = "●";
const EMPTY_SYMBOL = "○";

function getRoundAssistEmoji(round: RoundProgress): string {
  if (round.skippedAt) {
    return "❌";
  }

  if (round.hintCount > 0) {
    return "💡";
  }

  return "";
}


export function formatRoundShare(
  round: RoundProgress,
  countriesByIso: Record<string, CountryRecord>,
): string {
  const neighborTotal = countriesByIso[round.countryIso]?.neighbors.length ?? 0;
  const solved = round.found.length;
  const filled = ROUND_SYMBOL.repeat(solved);
  const empty = EMPTY_SYMBOL.repeat(Math.max(0, neighborTotal - solved));
  const missSuffix = round.misses > 0 ? ` +${round.misses}` : "";
  const assistEmoji = getRoundAssistEmoji(round);
  const prefix = assistEmoji ? `${assistEmoji} ` : "";
  return `${prefix}${filled}${empty}${missSuffix}`;
}

export function formatShareText(
  progress: StoredProgress,
  countriesByIso: Record<string, CountryRecord>,
): string {
  const lines = progress.rounds.map((round, index) => {
    return `R${index + 1} ${formatRoundShare(round, countriesByIso)}`;
  });


  return [`Edges ${progress.puzzleId}`, ...lines, "https://guessthyneighbour.com " 
  ].join("\n");
}
