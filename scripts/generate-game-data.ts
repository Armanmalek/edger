import { promises as fs } from "node:fs";
import path from "node:path";
import worldCountries from "world-countries";

type DifficultyBand = "easy" | "medium" | "hard";

interface SourceCountry {
  name: {
    common: string;
    official: string;
  };
  cca3: string;
  borders?: string[];
  latlng?: [number, number];
  altSpellings?: string[];
  region: string;
  subregion: string;
  unMember?: boolean;
}

interface CountryRecord {
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

interface MutableCountryRecord extends CountryRecord {
  rawNeighbors: string[];
}

interface DailyPuzzle {
  id: string;
  dateUTC: string;
  countries: [string, string, string];
}

interface GeometryFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: GeometryFeature[];
}

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, "generated");
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const GEO_DIR = path.join(ROOT, "node_modules", "world-countries", "data");

const MANUAL_ALIASES: Record<string, string[]> = {
  CIV: ["Ivory Coast", "Cote dIvoire", "Cote d Ivoire"],
  COD: ["DR Congo", "DRC", "Congo Kinshasa", "Democratic Republic of the Congo"],
  COG: ["Congo", "Republic of the Congo", "Congo Brazzaville"],
  CPV: ["Cape Verde"],
  CZE: ["Czech Republic"],
  GBR: ["UK", "U.K.", "Britain", "Great Britain", "United Kingdom"],
  KOR: ["South Korea", "Republic of Korea"],
  LAO: ["Laos", "Lao PDR"],
  MMR: ["Burma"],
  MKD: ["Macedonia"],
  PRK: ["North Korea", "DPRK"],
  SWZ: ["Swaziland"],
  TLS: ["East Timor"],
  USA: ["United States", "US", "U.S.", "America", "United States of America"],
};

function normalizeAlias(value: string): string {
  return value.trim();
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeBbox(coordinates: unknown): [number, number, number, number] {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }

    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const [lng, lat] = value as [number, number];
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
      return;
    }

    for (const entry of value) {
      visit(entry);
    }
  };

  visit(coordinates);

  if (!Number.isFinite(minLng)) {
    throw new Error("Unable to compute bbox");
  }

  return [minLng, minLat, maxLng, maxLat];
}

function pickDifficultyBand(neighborCount: number): DifficultyBand {
  if (neighborCount <= 3) {
    return "easy";
  }

  if (neighborCount <= 6) {
    return "medium";
  }

  return "hard";
}

function* eachUtcDay(start: Date, end: Date): Generator<Date> {
  for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    yield new Date(current);
  }
}

function getDateId(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function chooseCountry(
  pool: CountryRecord[],
  dateId: string,
  band: DifficultyBand,
  recent: string[],
  usedToday: Set<string>,
): string {
  const rng = mulberry32(hashSeed(`${dateId}:${band}`));
  const available = pool.filter(
    (country) => !recent.includes(country.iso3) && !usedToday.has(country.iso3),
  );
  const fallback = pool.filter((country) => !usedToday.has(country.iso3));
  const source = available.length > 0 ? available : fallback;
  const index = Math.floor(rng() * source.length);
  return source[index].iso3;
}

async function main() {
  const roster = (worldCountries as SourceCountry[])
    .filter((country) => country.unMember && country.cca3 !== "VAT")
    .sort((left, right) => left.name.common.localeCompare(right.name.common));

  if (roster.length !== 193) {
    throw new Error(`Expected 193 UN members, received ${roster.length}`);
  }

  const features: GeometryFeature[] = [];
  const countries: MutableCountryRecord[] = [];
  const adjacency: Record<string, string[]> = {};

  for (const country of roster) {
    const geoPath = path.join(GEO_DIR, `${country.cca3.toLowerCase()}.geo.json`);
    const rawGeo = JSON.parse(await fs.readFile(geoPath, "utf8")) as FeatureCollection;
    const feature = rawGeo.features[0];
    if (!feature?.geometry) {
      throw new Error(`Missing geometry for ${country.cca3}`);
    }

    const bbox = computeBbox(feature.geometry.coordinates);
    const neighborSet = new Set(
      (country.borders ?? []).filter((iso3) => roster.some((entry) => entry.cca3 === iso3)),
    );
    const neighbors = [...neighborSet].sort();
    const neighborCount = neighbors.length;
    const aliases = Array.from(
      new Set([
        country.name.official,
        ...(country.altSpellings ?? []),
        ...(MANUAL_ALIASES[country.cca3] ?? []),
      ]),
    )
      .map(normalizeAlias)
      .filter(Boolean)
      .filter((alias) => alias !== country.name.common)
      .sort((left, right) => left.localeCompare(right));

    const record: MutableCountryRecord = {
      iso3: country.cca3,
      name: country.name.common,
      aliases,
      neighbors,
      bbox,
      centroid: [country.latlng?.[1] ?? (bbox[0] + bbox[2]) / 2, country.latlng?.[0] ?? (bbox[1] + bbox[3]) / 2],
      difficultyBand: pickDifficultyBand(neighborCount),
      playable: neighborCount > 0,
      neighborCount,
      region: country.region,
      subregion: country.subregion,
      rawNeighbors: neighbors,
    };

    countries.push(record);
    features.push({
      type: "Feature",
      properties: {
        iso3: country.cca3,
        name: country.name.common,
      },
      geometry: feature.geometry,
    });
  }

  const countriesByIso = Object.fromEntries(countries.map((country) => [country.iso3, country]));

  for (const country of countries) {
    country.neighbors = country.rawNeighbors
      .filter((neighbor) => countriesByIso[neighbor]?.rawNeighbors.includes(country.iso3))
      .sort();
    country.neighborCount = country.neighbors.length;
    country.playable = country.neighborCount > 0;
    country.difficultyBand = pickDifficultyBand(country.neighborCount);
    adjacency[country.iso3] = country.neighbors;

    if (!country.aliases.length) {
      throw new Error(`Expected aliases for ${country.iso3}`);
    }
  }

  const easyPool = countries.filter((country) => country.playable && country.difficultyBand === "easy");
  const mediumPool = countries.filter(
    (country) => country.playable && country.difficultyBand === "medium",
  );
  const hardPool = countries.filter((country) => country.playable && country.difficultyBand === "hard");

  const recentByBand: Record<DifficultyBand, string[]> = {
    easy: [],
    medium: [],
    hard: [],
  };

  const puzzles: DailyPuzzle[] = [];
  const start = new Date("2025-01-01T00:00:00.000Z");
  const end = new Date("2031-12-31T00:00:00.000Z");

  for (const date of eachUtcDay(start, end)) {
    const dateId = getDateId(date);
    const usedToday = new Set<string>();
    const easy = chooseCountry(easyPool, dateId, "easy", recentByBand.easy, usedToday);
    usedToday.add(easy);
    const medium = chooseCountry(mediumPool, dateId, "medium", recentByBand.medium, usedToday);
    usedToday.add(medium);
    const hard = chooseCountry(hardPool, dateId, "hard", recentByBand.hard, usedToday);
    usedToday.add(hard);

    recentByBand.easy.push(easy);
    recentByBand.medium.push(medium);
    recentByBand.hard.push(hard);

    for (const band of Object.keys(recentByBand) as DifficultyBand[]) {
      while (recentByBand[band].length > 14) {
        recentByBand[band].shift();
      }
    }

    puzzles.push({
      id: dateId,
      dateUTC: dateId,
      countries: [easy, medium, hard],
    });
  }

  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(GENERATED_DIR, "countries.json"),
    JSON.stringify(
      countries.map(({ rawNeighbors: _rawNeighbors, ...country }) => country),
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(GENERATED_DIR, "adjacency.json"),
    JSON.stringify(adjacency, null, 2),
  );
  await fs.writeFile(
    path.join(GENERATED_DIR, "daily-puzzles.json"),
    JSON.stringify(puzzles, null, 2),
  );
  await fs.writeFile(
    path.join(GENERATED_DIR, "world-193.geo.json"),
    JSON.stringify({
      type: "FeatureCollection",
      features,
    }),
  );
  await fs.writeFile(
    path.join(PUBLIC_DATA_DIR, "world-193.geo.json"),
    JSON.stringify({
      type: "FeatureCollection",
      features,
    }),
  );

  console.log(`Generated ${countries.length} countries and ${puzzles.length} daily puzzles.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
