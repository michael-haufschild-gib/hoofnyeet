# Asset provenance and use

## Original artwork

Generated for this game using the built-in image generation tool. The original pony, countryside, dark slapstick atlas, six-world scenery set, equipment, crash rig, and material props are original commissioned outputs. Production textures use WebP compression, isolated alpha silhouettes, and transparent gutters. Crop metadata and generation prompts are retained in `../hoof-and-yeet-assets/art/` and public art manifests. No existing franchise characters were requested.

The materials atlas generated September 7, 2026 contains ordinary hay, a wooden crate, pastry, Swiss cheese, an office cabinet, a circus drum, a hazard barrel, bones, and a swim ring. Prompt: nine isolated illustrated cartoon objects, three-by-three transparent grid, bold dark outlines, warm shaded materials, no text or horse characters. Original: `materials-atlas.png` with `materials-crops.json`. Built-in image generation, one generation.

## Reused Slot effects

Explicit user authorization, September 7, 2026, to reuse effects from `monetisation/projects/slot/packages/pixi-runtime/src`.

- `shaders/symbol/impact/kapowBurstFilter.ts` and `shaders/core/filterVertex.ts`: comic rays, halftone ring and manual progress uniforms. Adaptation in `lib/game/effects/comic-burst.ts`; source blending changed to transparent standalone output.
- `particles/presets.ts`: shard lifetime/gravity and sparkle-tail curves. Adaptation in `lib/game/effects/impact-effects.ts`.
- `particles/presetsAmbient.ts`: short-lived growing smoke/dust behavior.

No remote Slot sprite-library frames are bundled. Their service was unavailable and source provenance was not established.

## ElevenLabs

Generation receipts, exact prompts, models, filenames, lengths, normalization, and file verification: `public/audio/manifest.json`. Persistent originals and production files: `../hoof-and-yeet-assets/audio/`. Runtime uses bundled MP3s; no API credentials are sent to players. No spoken TTS was generated because that permission was unavailable.

Intended use is a free, unmonetized browser game and audiovisual gameplay clips. No standalone sound-library download or resale feature is provided. Music is not submitted to content-identification systems or streaming catalogs.

Official terms reviewed September 7, 2026:

- Eleven Music model-specific terms, May 26, 2026: https://elevenlabs.io/eleven-music-model-specific-terms
- Sound effects documentation: https://elevenlabs.io/docs/overview/capabilities/sound-effects
- Prohibited Use Policy: https://elevenlabs.io/use-policy
- Publication guidance: https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform

The music terms define the restricted Studio Games category through monetization and multiple platforms. This release's stated use does not meet that definition. Integrated game sound and audiovisual use are supported; standalone SFX redistribution is restricted. Exported player clips are treated as integrated audiovisual use and do not grant broader rights to the underlying assets.

Account-specific plan and agreement proof could not be read with the available MCP permissions. Successful API generation receipts are available but are not represented as a full license audit. No paid/Enterprise license was bought during this work. Recheck the applicable plan and terms before adding advertisements, selling the game, releasing on other platforms, or licensing assets separately.

## Content version 5 escalation assets

The September 8, 2026 escalation adds three individually generated transparent illustrations: sausage pony, carnivorous bouquet, and discarded pony skin. Originals are retained in `../hoof-and-yeet-assets/art/carnage/originals/`; bundled, alpha-trimmed WebP files and verified pivots are in `public/art/carnage/`. The manifest there records source files, prompt summaries, dimensions, and transparency checks. These are individual images, not cropped sprite-sheet cells, and load when a world is prepared.

Sixteen additional short effects were generated through ElevenLabs MCP. Exact prompts and receipts are retained in `public/audio/manifest.json` and `../hoof-and-yeet-assets/audio/escalation-receipts.json`. Original MP3s remain in per-effect directories under `audio/originals`; normalized production files are retained under `audio/production` and bundled in `public/audio`. The existing soundtrack and effects are preserved. All new files decode as non-silent mono 44.1 kHz MP3s, with measured peaks below -3.5 dBFS. The receipt rip and UFO sneeze have their silent lead-ins trimmed; the manifest records those trims. No spoken TTS was used.

## Image production pipeline

`public/art` contains only game-ready WebP textures and runtime manifests. The unused PNG originals, complete source atlases, and crop/prompt metadata are preserved in `assets/source-art`, outside Vite's public deployment directory. Full-resolution texture masters are retained in `assets/source-art/masters`.

Run `pnpm optimize:images` to regenerate compressed, size-budgeted derivatives from those masters. It preserves the large title pony and outfit detail, reduces small props and effects according to their rendered size, retains alpha, and never repeatedly recompresses the previous output. Edit the masters when replacing artwork. `scripts/prepare-sprites.mjs` refreshes extracted masters before optimization and retains separately authored expressions and wings.

Physics contact geometry stays tied to the original silhouettes in `lib/game/art-metrics.json`; reducing a texture's pixel dimensions does not change hitboxes, pivots, world size, or scoring. The optimization report is written to `output/image-optimization/after.json`. The September 8 pass reduced 64 runtime textures from 3,442,396 to 2,302,346 bytes and resized 36 of them; the source PNGs and atlases are additional deployment savings, not player-download savings because the renderer already used WebP.

## September 8 visual polish

Two original, individually generated organ characters extend the existing injury layer: an indignant heart and a smug escaping brain. Full prompts, generator source paths, retained originals, dimensions, alpha checks and production bytes are recorded in `public/art/carnage/manifest.json`. Transparent lossless masters are in `assets/source-art/masters/carnage/`; the two runtime WebPs total 28,712 bytes and load during world preparation. Lower-intensity play substitutes existing pastry and doughnut illustrations.

Additional shader adaptations use the same explicit Slot reuse authorization:

- The contact lens in `lib/game/effects/impact-lens.ts` adds bounded impact refraction using recorded event time. It is disabled before gameplay is affected by a reduced rendering budget.
- The local black-hole and ghost vortex in `lib/game/effects/shaders/portal-vortex.ts` adapts polar spiral/noise techniques from Slot's `featurePortalVortexFilter` and reverses at the recorded ability release.
- `lib/game/effects/shaders/flame-mesh.ts` adapts fire-noise and warm/hot color grading from `pixi-runtime/src/shaders/anticipation/fireShaderFilter.ts`. Two locally transformed meshes keep rocket exhaust on the illustrated nozzle lips without filter render targets. Shader resources have explicit reset/disposal ownership; no independent clocks or timers were added.

Three further original illustrations support the world-specific spectator cartoons: a bone-flash camera, anatomical popcorn tub and toothy photocopier. The built-in image generator produced each as an individual transparent asset; complete prompts and source/master paths are recorded in the carnage manifest. Their runtime WebPs total 62,490 bytes and load only with the farm, carnival or office world respectively. Existing spectator art and reactions remain in place.

The afterlife queue's turnstile housing is another original built-in generation. Its separately animated bone arms use the existing bone illustration. The transparent housing is 84×256 pixels / 10,854 bytes; the manifest preserves the full prompt and authored axle coordinates, and its lossless master remains in the same carnage masters directory. It loads with shared finale art during world preparation.

Finite ignition fire/smoke in `lib/game/effects/combustion.ts` shares the same Slot-derived fire-noise family as rocket exhaust. Both use `fire-noise.ts` and the native scene-mesh binding in `scene-mesh.ts`. Ignition adds no artwork download or independent event clock; bounded local meshes sample the recorded contact origin and age.

The liquid-spray pass adds three more individually generated alpha illustrations: a glossy cherry-red droplet, irregular jelly splat, and gold-filled molar. Full prompts and source/original/master paths are in the carnage manifest. The optimized96/192/128-pixel runtime assets total11,976 bytes and load with prepared-world art. Their rotations, ground contacts and magnetic curves are sampled from existing recorded cues. Existing eyes, bones, material debris and floor marks remain; no additional physics bodies are created.

The nuclear ability pass adds an original illustrated mushroom cloud (533×640 WebP, 80,986 bytes), loaded only for the dynamite loadout, including clip export. Its lossless master and original are retained alongside the other carnage assets. Mesh articulation and local heat rays use the existing recorded crash clock. A 4.8-second atomic blast and comic sting was generated through ElevenLabs MCP; exact prompt, receipt, source path and measured normalization are in the audio manifest. The 58,349-byte mono production MP3 has a measured -3.6 dBFS decoded peak. No existing effects or music were replaced. The existing account-specific rights limitations above still apply.

## September 10 performance and wardrobe expansion

Three individually generated transparent accessories reward style and exploration: the specimen-brain bonnet, mirrored disco skull, and carnivorous sausage crown. Complete prompts, original/master paths, alpha measurements, and mounting artwork are retained in `assets/source-art/costumes.json` and `public/art/costumes/manifest.json`. The built-in image generator produced each separately; no generator model version is exposed by the tool. Original PNGs remain in `../hoof-and-yeet-assets/art/costumes/originals/`. Runtime WebPs are at most384 pixels and total120,960bytes, with transparent gutters; they load only when selected or required by recorded footage. `scripts/prepare-headwear.mjs` reproduces the optimized derivatives without recompressing prior runtime output.

Four new ElevenLabs MCP sound effects accompany real equipment combinations: anatomical applause, gas spring, electrical eyeball discharge, and haunted piano encore. Exact prompts and generation receipts are in `assets/audio/polish-20260910.json` and the public audio manifest. The tool does not expose its sound model identifier. Immutable originals and mono96kbps production copies remain in the established sibling audio directories; `scripts/prepare-polish-audio.mjs` reproduces measured normalization and verifies decoded peaks. These four production files total72,898bytes. Existing soundtrack, effects, and the account-specific rights limitations above remain unchanged.

Six world atmosphere treatments in `lib/game/effects/shaders/world-atmosphere.ts` adapt the polynomial noise/veil and sweeping spotlight techniques from Slot's `shaders/anticipation/nebulaStarfallVeilFilter.ts` and `shaders/target/celebration/spotlightSweepFilter.ts`, under the same explicit reuse authorization. A single transparent native mesh sits behind the course, samples recorded scene time, and adds no image download or intermediate framebuffer. Reduced motion stops ambient animation; constrained rendering budgets remove the atmosphere before affecting gameplay.

The world encores add three individually authored machine bodies: a carnivorous ice-cream cart, transparent lunar blender, and afterlife toaster. Full generation prompts and original paths are in `assets/source-art/encores.json`; the shared carnage manifest records retained originals, lossless masters, production dimensions, measured alpha bottoms, and runtime paths. `scripts/prepare-encores.mjs` produces the384px WebPs, totaling126,098bytes. They use the established world-specific spectator asset catalog, so none joins initial home startup; each is decoded and uploaded with its selected world. Moving contents reuse existing isolated artwork and the fixed192sprite pool. Paper/toast backing and foreground cords occupy separate native layers. No existing artwork or catastrophe was replaced.
