import adjacency from "@/generated/adjacency.json";
import countries from "@/generated/countries.json";
import puzzles from "@/generated/daily-puzzles.json";
import { normalizeCountryName } from "@/lib/game/normalize";
import type { CountryRecord, DailyPuzzle } from "@/lib/types";

export const countryRecords = countries as CountryRecord[];
export const countriesByIso = Object.fromEntries(
  countryRecords.map((country) => [country.iso3, country]),
) as Record<string, CountryRecord>;

export const adjacencyByIso = adjacency as Record<string, string[]>;
export const dailyPuzzles = puzzles as DailyPuzzle[];

export const aliasToIso = Object.fromEntries(
  countryRecords.flatMap((country) => {
    const values = [country.name, ...country.aliases];
    return values.map((alias) => [normalizeCountryName(alias), country.iso3]);
  }),
) as Record<string, string>;

export const playableCountries = countryRecords.filter((country) => country.playable);
