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
