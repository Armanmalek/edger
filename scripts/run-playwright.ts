import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import countries from "../generated/countries.json";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATE_ID = "2026-04-03";
const NEXT_DATE_ID = "2026-04-04";
const TEST_RESULTS_DIR = path.join(process.cwd(), "test-results");

interface RenderState {
  puzzleId: string;
  activeRound: number;
  activeCountry: string;
  activeCountryIso: string;
  expectedNeighbors: string[];
  foundNeighbors: string[];
  misses: number;
  completed: boolean;
  message: string | null;
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Timed out waiting for Next.js server");
}

async function getRenderState(page: import("playwright").Page): Promise<RenderState> {
  const raw = await page.evaluate(() => window.render_game_to_text?.() ?? "{}");
  return JSON.parse(raw) as RenderState;
}

async function waitForRenderableState(page: import("playwright").Page): Promise<RenderState> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const state = await getRenderState(page);
    if (Array.isArray(state.expectedNeighbors) && state.expectedNeighbors.length > 0) {
      return state;
    }

    await page.waitForTimeout(250);
  }

  throw new Error("Timed out waiting for renderable game state");
}

function chooseWrongGuess(state: RenderState) {
  const disallowed = new Set([...state.expectedNeighbors, state.activeCountry]);
  const country = (countries as { name: string }[]).find((entry) => !disallowed.has(entry.name));
  if (!country) {
    throw new Error("Unable to choose a wrong guess");
  }

  return country.name;
}

async function submitGuess(page: import("playwright").Page, guess: string) {
  await page.getByTestId("country-input").fill(guess);
  await page.getByTestId("submit-guess").click();
}

async function solveCurrentRound(page: import("playwright").Page) {
  const state = await getRenderState(page);
  for (const neighbor of state.expectedNeighbors) {
    if (state.foundNeighbors.includes(neighbor)) {
      continue;
    }
    await submitGuess(page, neighbor);
  }
}

async function main() {
  await mkdir(TEST_RESULTS_DIR, { recursive: true });

  const server = spawn(
    "python3",
    ["-m", "http.server", String(PORT), "-d", "out"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const serverLogs: string[] = [];
  server.stdout.on("data", (chunk) => {
    serverLogs.push(String(chunk));
  });
  server.stderr.on("data", (chunk) => {
    serverLogs.push(String(chunk));
  });

  try {
    await waitForServer(`${BASE_URL}/?date=${DATE_ID}`);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors: string[] = [];

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    await page.goto(`${BASE_URL}/?date=${DATE_ID}`, { waitUntil: "networkidle" });
    let state = await waitForRenderableState(page);
    await page.screenshot({ path: path.join(TEST_RESULTS_DIR, "edges-start.png"), fullPage: true });

    await submitGuess(page, state.expectedNeighbors[0]);
    await page.reload({ waitUntil: "networkidle" });
    state = await waitForRenderableState(page);
    if (state.foundNeighbors.length !== 1) {
      throw new Error("Expected reload to preserve the first correct guess");
    }

    const wrongGuess = chooseWrongGuess(state);
    await submitGuess(page, wrongGuess);
    await page.getByTestId("feedback").waitFor({ state: "visible" });

    state = await getRenderState(page);
    if (state.misses !== 1) {
      throw new Error("Expected wrong guess to increment misses");
    }

    while (true) {
      state = await waitForRenderableState(page);
      const remaining = state.expectedNeighbors.filter(
        (neighbor) => !state.foundNeighbors.includes(neighbor),
      );

      for (const neighbor of remaining) {
        await submitGuess(page, neighbor);
      }

      if (state.completed) {
        break;
      }

      await page.evaluate((ms) => window.advanceTime?.(ms), 1500);
      const nextState = await waitForRenderableState(page);
      if (nextState.completed) {
        break;
      }
      if (nextState.activeRound === state.activeRound) {
        await page.waitForTimeout(1500);
      }
      if (nextState.activeRound === 2) {
        await page.screenshot({
          path: path.join(TEST_RESULTS_DIR, "edges-round-three.png"),
          fullPage: true,
        });
      }
      if (nextState.completed) {
        break;
      }
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(TEST_RESULTS_DIR, "edges-finished.png"), fullPage: true });

    if (!(await page.getByTestId("share-button").isVisible())) {
      throw new Error("Expected share button after finishing all rounds");
    }

    const nextPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await nextPage.goto(`${BASE_URL}/?date=${NEXT_DATE_ID}`, { waitUntil: "networkidle" });
    const nextState = await waitForRenderableState(nextPage);
    if (nextState.puzzleId !== NEXT_DATE_ID || nextState.foundNeighbors.length !== 0) {
      throw new Error("Expected a fresh puzzle on the next UTC day");
    }

    await nextPage.screenshot({
      path: path.join(TEST_RESULTS_DIR, "edges-mobile-next-day.png"),
      fullPage: true,
    });

    await nextPage.close();
    await browser.close();

    if (errors.length > 0) {
      throw new Error(`Console errors detected:\n${errors.join("\n")}`);
    }
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
