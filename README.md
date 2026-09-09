# Hoof & Yeet: Extremely Unstable

A two-button illustrated chaos roguelite for desktop and mobile browsers. Gallop, time a trampoline launch, flap and flip, then use a collapsing pony to cause a thoroughly unnecessary chain reaction.

## Local play

Use Node.js 24+ and pnpm 10.15.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by [Vercel Portless](https://github.com/vercel-labs/portless): `https://hoofnyeet.localhost` by default. Portless manages the Vite port and reuses an existing local proxy's settings, so your URL may include its configured proxy port. `pnpm exec portless get hoofnyeet` prints the exact address. On first use, Portless may request local certificate trust. This is a Vite + React + TypeScript project; the browser game needs no account, backend, or runtime AI service.

Build and serve the production game locally:

```sh
pnpm build
pnpm preview
```

The production preview uses `https://preview.hoofnyeet.localhost`; `pnpm exec portless get preview.hoofnyeet` prints its exact address. `pnpm start` is an alias for the same preview command. The build produces self-contained static files in `dist/`, which can be served by any static web server. Portless is development tooling and is not bundled into the game.

For a physical phone on the same network, use Portless's optional LAN mode following its documentation. Browser records belong to their origin: previous records at `localhost:3000` or `localhost:3001` remain there and do not automatically move to the new hostname.

| Input                               | Run-up                   | Flight     | Crash            |
| ----------------------------------- | ------------------------ | ---------- | ---------------- |
| Space / left mouse / left touch pad | Distinct taps accelerate | Panic flap | Panic kick       |
| Up / right mouse / right touch pad  | Manual jump              | Somersault | Equipped ability |
| P / Escape / pause button           | Pause                    | Pause      | Pause            |

The title screen shows the animated pony and a three-row control guide: Run / Jump, Flap / Roll, and Kick / Ability. The guide displays mapped keys and mouse buttons on desktop, and matching action-button symbols on touch screens. A short first-run overlay pauses the countdown and explains the two controls; returning players do not have to dismiss it again. Run requires repeated taps.

Jump when the arrow and take-off zone turn green. Striped posts and pennants mark the trampoline, and the camera anticipates the entire launch area. Approach speed and trampoline accuracy determine launch strength. Distance includes the furthest position reached during the crash: spring rebounds, panic kicks, and equipped abilities all extend it. Moving backwards never subtracts distance, and loose debris does not count as the player. Results separate the initial jump from the extra distance after landing; style and havoc are separate. Failed launches settle quickly. Normal crashes retain their final punchlines and wait for the controlled body to settle after late abilities or kicks. Landings run once, with optional replay.

Catch the visible wind lane for extra forward momentum. Lift carries the pony along the lane while gravity gradually brings it down; save a panic flap to extend the flight. Bean propulsion turns that control into FART BOOST, with stronger flaps, expanding gas puffs and a tail flick. Pocket weather adds a blowing cloud companion and continuous forward acceleration; combining them produces a bigger fart boost. Jetpacks, featherweight, acrobatics and several impact perks have distinct equipment and motion effects. Perk bursts capture their original position and rotation for synchronized replay and clips, with bounded particles and reduced-effects support. The pony, rings and landing plane stay in the same world geometry, with no off-screen climb. Commentary appears below the action during landings and replays.

PLAY TOUR is the main route to equipment and progression; an unfinished tour appears as RESUME TOUR. Quick play starts immediately. Levels opens all six worlds for standalone attempts without overwriting a saved tour. Pony & hats opens customization directly, and Upgrades shows the available abilities and passive perks with their effects. Daily remains a separate seeded challenge. Tours contain nine events across three acts, with two world choices at each act boundary and a boss at each act's end. Clicking a world launches it. Between events, choose NEXT, then an upgrade to launch the next event automatically. A full loadout prompts for a replacement. Open Shop & reroll before choosing an upgrade to stay at the pit stop and browse paid equipment, insurance, and rerolls. Four passives and one active can be carried. Failed objectives consume insurance; the third failure ends the tour. Daily Disaster and friend links reproduce seeded conditions; records are local to the device.

Scrapbook, inside Settings, keeps discoveries and five recent incidents. The results screen offers an instant retry or continuation, Replay, and Share. Inside Share, Full incident is selected by default; 8, 10, and 12-second vertical or landscape highlights remain available. Generate the file, then use the separate Share video button or download it. MP4 is preferred when supported, otherwise WebM. An image card remains available when video recording is unavailable. Nothing posts automatically.

Settings includes an illustrated dressing room: four pony appearances and four achievement hats. Outfits preview immediately on the pony; recorded incidents retain the outfit worn during that attempt. Hats, wings, shoes and rocket nozzles use articulated attachment points. Completing tours unlocks the one-flap and single-insurance-stamp rules; friend links preserve those rules. Daily Disaster always uses the standard rules and keeps classic/assisted records separate under the original UTC date, even when a tour crosses midnight.

Course version 5 adds overlapping anatomical comedy, world-specific spectator disasters, extended boss punchlines and recorded grab/attachment state. The dynamite ability now produces an illustrated nuclear mushroom cloud, pressure wave and delayed survivor gag while retaining its forward blast. Existing version-4 records, equipment, hats, discoveries and recordings are preserved. Previous daily records are labeled as an earlier course, and an unfinished earlier daily continues as a regular tour with its equipment and progress preserved. Current daily records use the revised course conditions. Outdated friend links explain that a fresh run is needed.

## Engine and ownership

- `content.ts`: six worlds, 24 passive relics, six active abilities, eight deliberate synergies.
- `run.ts`: objectives, routes, rewards, insurance, equipment, challenge descriptors.
- `challenge-rules.ts`, `cosmetics.ts`: permanent challenge and appearance unlocks.
- `simulation.ts`: fixed 120 Hz arcade simulation and swept trampoline intersection.
- `crash.ts`: Rapier 2D bodies, breakable joints, machinery, activated collision chains, and event beats.
- `renderer.ts`, `pose.ts`, `terrain.ts`, `effects/`: native PixiJS 8 scene, articulated pose sampling, world surfaces, bounded manual effects.
- `controller.ts`: shared input contract, phase transitions, event delivery, replay snapshots, checkpoints.
- `audio.ts`, `audio-assets.ts`: shared live/export asset catalog, decoded level preparation, local ElevenLabs music/SFX, crossfades, ducking, priority-aware concurrency limits and mix limiter.
- `storage.ts`: versioned local records and migration. `sharing.ts`: bounded IndexedDB incidents, replay export, native sharing.
- `app/`: accessible React controls, route selection, equipment, results, settings, and evidence locker.

Arcade simulation and crash physics never run from React. Replay uses recorded transforms and semantic events rather than resimulating physics or awarding anything. Presentation recording time includes hit freezes. Seeded encounters control entity order; floating-point physics is not claimed bit-identical across different JavaScript engines.

Recorded frames also retain simulation time. Pony poses, particles, camera easing and impact shaders share that clock, so slow replay and hit freezes affect the entire scene. Trampoline compression uses the same net/contact dimensions in the simulation and renderer. Scenery spectators use stable world cells rather than a screen-relative repeating strip.

PixiJS and Rapier versions are pinned. Rendering uses WebGL; no WebGPU or desktop-only API is required for play. Focus loss and touch cancellation clear inputs and pause. Paused scenes stop redundant drawing and update when the viewport, outfit or graphics context changes. A graphics interruption freezes the attempt, restores GPU bindings and text, and waits for manual resume. Storage failure and unavailable browser audio support do not prevent play. Level preparation waits for selected artwork, GPU uploads, fonts and decoded sound, and warms the nuclear shader and mesh offscreen before its first use; a failed asset offers retry without spending an attempt or insurance. Other-world artwork stays lazy. Sustained slow rendering first reduces decorative particles, then pixel resolution; physics and recorded incidents keep the same timing. The chosen graphics budget stays stable during the session, while exported clips retain their requested dimensions and effects. Exported captions wrap below the action so they cannot cover the landing plane.

## Artwork and sound

Original illustrations, transparent rigs, environment props, equipment, and fonts are bundled locally. Production sprites are individually extracted with clean alpha and gutters, avoiding neighboring atlas cells. Persistent artwork/audio originals and generation receipts live alongside this project in `../hoof-and-yeet-assets/`.

All runtime artwork and sound are bundled in `public/`. Optimized WebP derivatives are reproducible from lossless masters in `assets/source-art/masters` using `pnpm optimize:images`. The optional original sprite extraction scripts use `sharp` and the separate originals directory; set `HOOF_ASSET_DIR` if it is elsewhere.

The 66-file ElevenLabs bank contains ten music tracks and 56 effects/stings, including the nuclear blast and 16 anatomical comedy cues. See `docs/asset-provenance.md` and `public/audio/manifest.json`. Slot's comic-burst, fire, vortex and particle techniques are adapted with the user's explicit authorization; no Slot service or database is a runtime dependency. All new visual effects honor reduced-motion and lower-intensity preferences, use recorded clocks, and have bounded resource ownership.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
pnpm build
```

Start `pnpm dev` before browser tests. Tests discover the local URL through Portless; `HOOF_BASE_URL` overrides it for an explicitly supplied server. They include keyboard, mouse and touch flows, full tours, recorded clip export, optional replay, saved progress, and a rendered catastrophe gallery. The shared test fixture silences speaker output while keeping audio tracks available for export verification. Phone profiles are browser emulation, not physical-device measurements. Reports, screenshots and videos are written to `output/playwright/`.

For unattended testing on a Mac connected to power, `caffeinate -is pnpm test:browser` prevents system sleep for the lifetime of that command. It does not unlock the screen or change persistent power settings. Host sleep can otherwise invalidate timing-sensitive browser tests.

For a production smoke check, run `pnpm build`, start `pnpm preview`, then run `pnpm exec node scripts/production-check.mjs`. It discovers the preview URL through Portless (`HOOF_PREVIEW_URL` can override it), tests an actual round with keyboard input, checks asset requests and the initial 8 MB budget, and reports frame timing and GPU identity. `HOOF_MOBILE=1` uses native touch input in phone emulation; `HOOF_HEADED=1` runs a visible Chromium window. Chromium always runs with `--mute-audio`.

The authored application and tests are linted; the starter's unchanged component catalog is outside that command. Development exposes `window.__hoof` for tests; the production build excludes it. Feature-detected WebMCP exposes only read/start/two-action controls.

For a renderer-only stress trace, run `HOOF_HEADED=1 HOOF_ADAPTIVE=1 HOOF_PROFILE_FIRE=1 pnpm exec node scripts/profile-renderer.mjs`. It samples one recorded incident and reports first-use effect costs, frame times, graphics quality and GPU identity. Optional `HOOF_CPU_RATE=4` applies Chromium CPU throttling; this leaves the host GPU unchanged and is not a physical-phone benchmark.

Local verification notes and generated reports are excluded from Git. The repository includes source, production assets, tests, and the pnpm lockfile.
