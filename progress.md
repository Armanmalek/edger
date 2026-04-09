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

## TODO

- Consider stronger map polish in a future pass: richer connection animations, better neighbor color contrast, and possibly per-country viewport tuning for tiny states.
- Consider moving `countries.json` and `daily-puzzles.json` to on-demand fetches too if bundle size becomes a concern beyond the current optimized build.
