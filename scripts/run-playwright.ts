import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { chromium } from "playwright";
import countries from "../generated/countries.json";

const PORT = 3100;
const BASE_PATH = process.env.GITHUB_PAGES === "1" ? "/edger" : "";
const BASE_URL = `http://127.0.0.1:${PORT}${BASE_PATH}`;
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
  visibleFoundNeighbors: string[];
  misses: number;
  hintCount: number;
  skipped: boolean;
  completed: boolean;
  message: string | null;
  celebrationStep: number | null;
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

async function waitForCelebrationStep(
  page: import("playwright").Page,
  atLeast: number,
): Promise<RenderState> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const state = await getRenderState(page);
    if (typeof state.celebrationStep === "number" && state.celebrationStep >= atLeast) {
      return state;
    }

    await page.waitForTimeout(120);
  }

  throw new Error("Timed out waiting for celebration state");
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
  const serveRoot =
    BASE_PATH.length > 0
      ? await (async () => {
          const tempRoot = await mkdtemp(path.join(os.tmpdir(), "edges-pages-"));
          const targetDir = path.join(tempRoot, BASE_PATH.slice(1));
          await cp(path.join(process.cwd(), "out"), targetDir, { recursive: true });
          return tempRoot;
        })()
      : path.join(process.cwd(), "out");

  const server = spawn(
    "python3",
    ["-m", "http.server", String(PORT), "-d", serveRoot],
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

    await page.getByTestId("hint-button").click();
    state = await getRenderState(page);
    if (state.hintCount !== 1) {
      throw new Error("Expected hint use to increment hint count");
    }
    if (!(await page.getByTestId("hint-list").isVisible())) {
      throw new Error("Expected hint list to appear after using a hint");
    }

    await solveCurrentRound(page);
    state = await waitForCelebrationStep(page, 1);
    await page.screenshot({
      path: path.join(TEST_RESULTS_DIR, "edges-round-one-celebration.png"),
      fullPage: true,
    });
    state = await waitForCelebrationStep(page, state.expectedNeighbors.length);
    await page.screenshot({
      path: path.join(TEST_RESULTS_DIR, "edges-round-one-complete.png"),
      fullPage: true,
    });
    await page.evaluate((ms) => window.advanceTime?.(ms), 3200);

    while (true) {
      state = await waitForRenderableState(page);
      if (state.activeRound === 1) {
        await page.getByTestId("skip-button").click();
        const skippedState = await waitForRenderableState(page);
        if (skippedState.activeRound === 1) {
          throw new Error("Expected skip to close the current round");
        }
        continue;
      }
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

    const allText = await page.locator("body").innerText();
    if (!allText.includes("💡")) {
      throw new Error("Expected hinted round emoji in share output");
    }
    if (!allText.includes("❌")) {
      throw new Error("Expected skipped round emoji in share output");
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
    if (BASE_PATH.length > 0) {
      await rm(serveRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
