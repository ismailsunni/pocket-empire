# Assets and attribution

Per PRD §22, licence and attribution are recorded **at the time an asset is
adopted**, not retroactively.

## Current status: Phase 1 — no third-party assets

The game ships no art or audio files. Everything visible is drawn at runtime
from flat coloured shapes, and every sound is synthesised with the Web Audio
API (`src/audio/Audio.ts`). Nothing here is derived from any other game.

This is deliberate: art must not block gameplay work, and synthesised cues
avoid both an asset licence and a download budget while still covering the §22
audio scope (acknowledgement, attack, building complete, age advanced,
victory, defeat, under attack). Audio is muted by default, since browsers
block autoplay and phone players often play muted.

## Legal boundary (PRD §1.1)

This project takes design inspiration from Age of Empires II. It uses no
Microsoft or Ensemble assets, art, audio, unit names, civilization names, tech
tree data, or strings. All names are generic — Villager, Spearman, Archer,
Town Center, Barracks, Archery Range, Tower — and any that prove too close will
be renamed. The project is not described as a clone of any existing game in
public-facing copy.

## Decisions binding a future art pass (§22)

- **Projection: top-down orthogonal.** Simpler math, simpler
  pathfinding-to-screen mapping, simpler touch hit-testing, and it reads
  clearly on a small screen. The renderer already assumes it.
- **Tile size: 32 px** at zoom 1 (`src/rendering/theme.ts`).
- **Player colours** are blue and red. Resource-node colours were chosen to
  stay distinguishable from them — berry bushes are pink rather than red
  specifically so they do not read as enemy units at a glance.
- Sprite sheet versus individual images, and the mobile texture-atlas budget,
  are still open and must be settled before Phase 2.

## When an asset pack is adopted

Add a row here at the moment of adoption:

| Asset | Source | Author | Licence | Where used |
|---|---|---|---|---|
| _(none yet)_ | | | | |
