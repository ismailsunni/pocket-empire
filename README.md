# Pocket Empires

A mobile-first, browser-based real-time strategy game. Open a URL, start a
match, gather resources, build a settlement, raise an army, and destroy the
enemy Town Center. No installation, no account, no backend.

**Play it: <https://ismailsunni.github.io/pocket-empire/>**

Implements [`pocket-empires-prd.md`](./pocket-empires-prd.md) (v0.2). Section
references throughout the code point back at it.

Every push to `main` runs lint and the simulation tests, then deploys to
GitHub Pages — a broken simulation cannot reach the live URL.

## Running it

```sh
npm install
npm run dev      # dev server
npm run build    # typecheck + production build
npm run test     # simulation tests
npm run lint
```

## How to play

Tap a villager, then tap a tree, berry bush, or ore to gather. Tap the Town
Center to train more villagers. Select a villager and use **Build** to place a
House (population), a Farm (renewable food), and a Barracks (Spearmen). Bank
400 food to advance to the Feudal Age, which unlocks the Archery Range,
Archers, Towers, and economic upgrades. Find the enemy and destroy their
Town Center.

| Gesture | Result |
|---|---|
| Drag from empty ground | Pan camera |
| Drag from your own unit | Box select |
| Tap own unit / building | Select |
| Tap terrain, enemy, or resource with a selection | Move / attack / gather |
| Double-tap own unit | Select all of that type on screen |
| Pinch | Zoom |
| Long-press | Contextual menu (move, attack-move, rally, stop) |

Desktop: left click selects, left drag box-selects, right click issues the
contextual command, wheel zooms, WASD/arrows and screen edges scroll, number
keys are control groups (shift+number assigns), `B` build, `S` stop, `H` jump
to Town Center, `.` cycles idle villagers, `Esc` cancels.

## Architecture

```
src/
├── simulation/   deterministic, no rendering dependencies
├── data/         balance JSON — every number lives here
├── map/          generation, flow-field pathfinding, spatial grid
├── rendering/    Phaser scene and renderers
├── input/        touch and mouse adapters over one command emitter
├── ui/           DOM HUD, menus, minimap
├── audio/        synthesised cues
└── persistence/  localStorage settings, IndexedDB saves
```

Four rules hold the design together, and the first two are enforced by ESLint
rather than by convention:

1. **The simulation never imports Phaser** (or any renderer, UI, or input
   module). `npm run lint` fails if it does.
2. **The simulation is deterministic.** No `Math.random`, `Date.now`, or
   `performance` inside `simulation/` and `map/`; time is tick count, and
   randomness comes from a seeded PRNG whose state is one integer. A test
   asserts that the same seed and command sequence produce an identical state.
3. **One clock.** The simulation runs at a fixed 20 Hz behind an accumulator;
   rendering interpolates between the last two states. Expensive work is
   staggered across ticks — combat every 2nd tick, one AI subsystem per cadence
   tick, path requests budgeted per tick — rather than given its own rate.
4. **All intent is a command.** Player input, the AI, and later a network peer
   all push `Command` objects into one queue, applied at a tick boundary.
   Nothing mutates `GameState` directly, and `GameState` is plain serializable
   data, which is what makes both IndexedDB saves and future multiplayer
   reachable rather than a rewrite.

Pathfinding is two-tier (§19.3): one Dijkstra integration field per
destination, shared by every unit heading there, plus short-range separation
steering. Per-unit A* is explicitly avoided.

## Decisions taken on the PRD's open questions (§27)

| Question | Decision |
|---|---|
| Flow-field performance | Kept at 100 units on a 96×96 map. The simulation costs ~0.8 ms per tick against an 8 ms budget, measured in-browser. See the caveat below. |
| Fixed-point or float | **Float**, with the cross-platform lockstep caveat accepted and recorded. Revisit before multiplayer. |
| Reference device | **Unresolved — this is the owner's call.** No physical phone was available; the 30 FPS floor is therefore unverified. |
| Farms | **Permanent and renewable.** They never deplete, which keeps mid-game touchscreen management low. |
| Population cap | **House-limited with a hard cap of 50** as a performance guard. Starting cap is 10. |
| Scout unit | **No scout.** Villagers scout; adding one is a data change. |

## Known deviations from the PRD

- **The AI cheats with full map vision**, as §14 permits for MVP. It has no fog
  state of its own.
- **Losing every Town Center is immediate defeat**, the headline rule in §6.
  The §6 edge case (a side with no means to rebuild or fight) is subsumed: a
  player with no entities at all is also defeated, so a stalemate cannot occur.
  Rebuilding a destroyed Town Center is therefore not possible in MVP.
- **Frame rate is unmeasured on real hardware.** In this development
  environment rendering runs on a software GL rasterizer, where even a blank
  Phaser canvas costs ~100 ms per frame; the number says nothing about a phone.
  The JavaScript budget, which is measurable here, is well inside target.
- **No playtest has been run.** The §24.2 measurable criteria — eight
  first-time testers on their own phones — are the outstanding validation step.

## Post-MVP queue

In PRD order: Cavalry and the Castle Age (restores the counter triangle and
the tactical depth MVP knowingly lacks, §10.1) · an AI with its own fog state ·
AI personalities · repair · tutorial · PWA · multiplayer.
