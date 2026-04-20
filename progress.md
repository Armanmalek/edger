Original prompt: Build Edges as a static-first Next.js App Router daily geography game where players guess all land-border neighbors for 3 countries per day, with a map-first UI, local persistence, and no backend.

## Progress

- Initialized greenfield implementation plan for a Next.js App Router web app.
- Locked core product decisions from the user: web app, 00:00 UTC reset, fixed 3-country sequence, bundled static data, local streak/share state, unlimited tracked misses, spoiler-free sharing, 193 UN members only.
- Starting with project scaffolding, generated-data pipeline, and test harness setup before gameplay implementation.
- Installed and configured Next.js 14, React 18, Framer Motion, React Simple Maps, Vitest, and Playwright.
- Built a data generator from `world-countries` that outputs the 193-country roster, symmetric land-border graph, 5+ years of daily puzzles, and a static GeoJSON map asset.
- Implemented the Edges game surface with map-first layout, per-round progression, local persistence, UTC puzzle rollover, spoiler-free sharing, and test/debug hooks.
- Added helper/unit coverage plus a Playwright flow that verifies reload persistence, wrong-guess miss counting, full 3-round completion, share UI, and next-day rollover.
- Adjusted the map viewport math after screenshot review so the active country and its neighbors render at a readable scale on desktop and mobile.
- Replaced the browser `datalist` with an in-app suggestion tray and keyboard navigation so guess entry behaves consistently across browsers and mobile.
- Reworked the map camera to bias toward the active country rather than the raw neighbor bounds midpoint, which produces a more puzzle-like framing.
- Moved the end-to-end harness off `next dev` and onto the built static output served from `out/`, which removed flaky hydration timing and made screenshot review match the shipped experience.
- Removed the Framer Motion inline aside animation after it caused a client/server hydration warning during browser verification.
- Applied a full dark-mode visual pass: green space-atlas background, darker panels, brighter off-white typography, and a darker grey map with stronger border visibility.
- Increased the round-complete handoff delay from 1350ms to 3000ms so users can actually see the connection animation before the next country loads.
- Tightened the map stroke treatment and active-country highlight to make geographic separations more readable within the darker palette.
- Renamed the Vitest config to `vitest.config.mts` after the runner started failing to load the ESM config under the current toolchain.
- Simplified the map camera behavior to a fixed non-interactive view centered on the active country, with enough zoom-out to keep surrounding geography visible.
- Reworked the map renderer into separate base-fill, highlight, and top-boundary passes so every country outline remains visible while the active country and found neighbors render clearly on top.
- Updated the Playwright harness to capture the hydrated map state before taking the start screenshot, which made screenshot review reflect the real rendered game state.
- Reworked solved-round highlighting into a staged recolor sequence: correct neighbors now stay in guess order, previously found neighbors darken one-by-one during completion, and the final guessed neighbor renders directly into the complete color instead of using the intermediate fill.
- Removed the old line-based celebration overlay from the map and replaced it with per-country SVG lift/slam animation on the recolor step, with the control rail held in gameplay mode until the final celebration finishes.
- Extended the render/debug state and Playwright harness so browser verification can stop during the recolor sequence and capture a dedicated celebration screenshot.
- Verified the new celebration visually from production screenshots (`edges-start.png`, `edges-round-one-celebration.png`, `edges-finished.png`, and `edges-mobile-next-day.png`).
- Attempted to run the packaged `develop-web-game` Playwright client, but the shipped script currently fails in this environment because it is an ESM file published as `.js` outside the repo and cannot resolve the local `playwright` dependency from its install path.
- Added per-round hint metadata and skip metadata with storage migration so older saved progress upgrades cleanly.
- Implemented a deterministic hint system in the control rail plus a skip-round action; hints now reveal ordered clue cards for the current country and skipped rounds auto-complete without celebration.
- Updated share output so hinted rounds are prefixed with `💡` and skipped rounds are prefixed with `❌`, and adjusted daily completion so skipped runs do not increment streaks.
- Extended the production Playwright flow to use a hint on round 1, skip round 2, solve round 3, and verify the final summary contains both `💡` and `❌`.
- Added a GitHub Actions Pages deployment path from `master`, preserving the custom domain through `public/CNAME` and disabling Jekyll through `public/.nojekyll`.
- Simplified the static export configuration for the custom-domain root so built assets resolve from `/_next/...` instead of `/edger/_next/...`.
- Updated the production Playwright flow to verify inline input validation and the solved-round summary/continue state after non-final celebrations.
- Verified the deployment migration with `npm run test:unit`, `npm run build:pages`, generated asset-path checks, and `npm run test:e2e`; inspected the new Playwright screenshots after the production flow passed.

## TODO

- Consider stronger map polish in a future pass: richer connection animations, better neighbor color contrast, and possibly per-country viewport tuning for tiny states.
- Consider moving `countries.json` and `daily-puzzles.json` to on-demand fetches too if bundle size becomes a concern beyond the current optimized build.
- If the shared `develop-web-game` client needs to be used directly next time, either fix the skill packaging or add a repo-local wrapper so it can resolve ESM and the workspace `playwright` install cleanly.
- After merging this deployment change, set GitHub Pages in the repository settings to deploy from GitHub Actions rather than the `gh-pages` branch.
