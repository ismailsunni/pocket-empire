# PRD — Pocket Empires

**Mobile-first browser RTS**
Version 0.2 · Revision of initial draft

---

## 1. Product Overview

**Working title:** Pocket Empires

**Product type:** Mobile-first real-time strategy game

**Platform:** Web browser. Optimized for Android phones, fully playable on desktop.

**Core inspiration:** Classic Age of Empires II-style RTS gameplay, simplified for touchscreen and browser play.

**Initial architecture:** 100% frontend. No backend, account, database, or installation required.

**Core promise:**

> Open a URL, start a match, gather resources, build your settlement, create an army, and defeat the enemy.

### 1.1 Legal boundary

This project takes design *inspiration* from Age of Empires II. It uses no Microsoft/Ensemble assets, art, audio, unit names, civilization names, tech tree data, or strings. All names in this document are generic (Spearman, Archer, Cavalry, Town Center) and any that prove too close will be renamed. The project is never described as an "Age of Empires clone" in public-facing copy.

---

## 2. Problem

Classic RTS games provide a compelling gameplay loop:

> Economy → technology → army → tactical combat → victory.

Most mobile strategy games replace this with persistent progression, timers, currencies, and asynchronous combat.

There is an opportunity for a simple, immediately playable, browser-based RTS that delivers the classic loop without installation or a powerful PC.

---

## 3. Goals

### Primary goals

1. Create a playable AoE-like RTS in a web browser.
2. Optimize the interface for touchscreen phones.
3. Require zero installation.
4. Keep the first match simple enough to understand without a tutorial.
5. Provide real-time economy, construction, unit production, and combat.
6. Support desktop mouse/keyboard controls in the same build.
7. Keep the simulation deterministic and command-driven so multiplayer remains possible later.

### Secondary goals

- Procedurally generate maps.
- Provide a competent basic AI opponent.
- Matches of approximately 10–30 minutes.
- Visual clarity on a small screen.

---

## 4. Non-goals for MVP

Not in the first version:

Multiplayer · Accounts · Cloud saves · Backend · Microtransactions · Multiple civilizations · Campaign · Diplomacy · Naval warfare · Terrain elevation · Hero units · Large technology trees · Voice chat · Social features · App-store distribution

**The objective is to prove that the core RTS loop is fun.**

### 4.1 Deferred from MVP (changed from v0.1)

These were in the original scope and have been pushed out to reduce risk:

| Item | Reason | Target |
|---|---|---|
| Castle Age (3rd age) | Two ages already prove the progression loop. Third age adds units, upgrades, balance surface, and art for marginal validation. | Post-MVP |
| Cavalry unit | Tied to Castle Age. The counter triangle degrades to a duel in MVP — accepted, see §10.1. | Post-MVP |
| AI personalities | One competent AI is the requirement. | Post-MVP |
| Repair | Nice-to-have villager action, non-essential to the loop. | Post-MVP |
| Tutorial | Success criteria demand the game be learnable without one. | Post-MVP |

---

## 5. Target Users

**Primary:** Players who enjoy classic RTS games (Age of Empires, Warcraft, Command & Conquer, Rise of Nations) but want something they can play quickly on a phone.

**Secondary:** Casual mobile players who want *"a strategy game I can open in the browser and play immediately."*

---

## 6. Core Gameplay

A match starts with:

- 1 Town Center
- 5 Villagers
- Limited starting resources
- Procedurally generated map
- 1 AI opponent

### Core loop

```
Explore
   ↓
Gather resources
   ↓
Build base
   ↓
Produce units
   ↓
Research tech
   ↓
Expand army
   ↓
Attack
   ↓
Destroy enemy Town Center
```

### Victory / defeat conditions

- **Victory:** enemy Town Center destroyed.
- **Defeat:** player Town Center destroyed.
- **Edge case — no Town Center, no villagers, no military:** the side with no means of rebuilding or fighting is defeated immediately rather than left in a stalemate.
- **Surrender:** available from the pause menu at any time.
- **Time limit:** none in MVP. If playtests produce stalemates, revisit.

---

## 7. Resources

Four resources.

| Resource | Primary use |
|---|---|
| Food | Villagers, basic units, technology |
| Wood | Buildings, archers, farms |
| Gold | Advanced units and technology |
| Stone | Defensive buildings and later structures |

Resources exist as map objects or deposits: forest → wood, food source → food, stone deposit → stone, gold deposit → gold.

### 7.1 Rules that must be decided before implementation

These affect economy pacing and AI logic, so they are decisions, not details:

- **Deposits are finite** with a fixed amount per node. Depletion drives expansion, which drives map contest. Farms are the renewable exception.
- **Carry capacity:** villagers carry a fixed amount (e.g. 10) then walk to the nearest drop-off point.
- **Drop-off points:** Town Center accepts all resources in MVP. No separate mill/mining camp — one less building, one less concept.
- **Gather rates are per-resource** and live in the balance data file (§11.1), not in code.
- **Auto-retask:** when a node depletes, the villager automatically moves to the nearest same-type node within a radius, else goes idle and counts toward the idle-villager indicator.

---

## 8. Villagers

Villagers are the foundation of the economy.

**Actions:** move, gather (food/wood/gold/stone), build.
*(Repair deferred — §4.1.)*

**States:** Idle · Moving · Gathering · Building · Returning (carrying resources) · Dead

**Interaction:** tap a villager to select; tap a resource node to gather; tap ground to move; use the build menu to place a building. Contextual command resolution — the game infers intent from what was tapped rather than requiring a verb-first selection.

---

## 9. Buildings

| Building | Function |
|---|---|
| Town Center | Produces villagers, provides population capacity, resource drop-off, main defeat condition |
| House | Increases population capacity |
| Barracks | Produces melee infantry |
| Archery Range | Produces ranged units |
| Farm | Renewable food source (worked by a villager) |
| Tower | Defensive structure, automatically attacks nearby enemies |

### 9.1 Placement rules

- Buildings occupy a whole-tile footprint and block movement.
- Placement is invalid on: water, resource nodes, existing buildings, or tiles currently occupied by units. Units standing on an otherwise valid footprint are pushed out on placement rather than blocking it.
- Placement requires explored terrain (not necessarily currently visible).
- Ghost preview shows valid/invalid state before confirmation.
- Construction consumes resources at placement time, not on completion. Cancelling a partially built building refunds a portion.
- Multiple villagers on one construction site reduce build time (sub-linearly).

---

## 10. Military Units

| Unit | Role |
|---|---|
| Spearman | Cheap melee, strong vs cavalry, weak vs archers |
| Archer | Ranged, strong vs infantry, weak vs cavalry |
| Cavalry | Fast, strong vs archers, expensive — **post-MVP** |

Intended counter system:

```
Spearman → Cavalry
Cavalry  → Archer
Archer   → Spearman
```

### 10.1 Known MVP consequence

With cavalry deferred, MVP ships with Spearman vs Archer only, where Archer beats Spearman. That is not a triangle — it is a dominance relation, and it will make MVP combat shallow.

Mitigation for MVP: archers cost gold and have low HP, so massing them is economically gated and punished by tower fire and by spearman numbers. This is enough to test *whether combat is legible*, which is the MVP question. Restoring tactical depth requires cavalry and is the first post-MVP priority.

---

## 11. Technology / Ages

MVP contains **two** ages.

**Age I — Dark Age.** Villagers, Houses, Farms, Barracks, Spearmen.

**Age II — Feudal Age.** Unlocks Archery Range, Archers, Towers, and basic economic upgrades.

```
Dark Age
   │  400 Food
   ↓
Feudal Age
```

*Castle Age deferred (§4.1). The age system itself must be data-driven and support N ages so adding the third is a data change, not a code change.*

### 11.1 Balance data

All unit, building, technology, and resource numbers live in versioned JSON under `src/data/`. Nothing numeric is hardcoded in simulation classes. Rationale: these values will be retuned dozens of times during playtesting, and later they become the payload that must match across multiplayer clients.

---

## 12. Combat

Every military unit has: HP, Attack, Armor, Attack Range, Movement Speed, Attack Cooldown.

Example:

```
Archer
HP: 40   Attack: 5   Range: 5   Speed: 2.5
```

**Behavior on attack order:** move toward target → stop within range → attack on cooldown → continue until target dies or a new command is issued. On target death, auto-acquire the nearest hostile within a small radius; otherwise hold position.

**Passive aggression:** idle military units auto-attack hostiles entering their vision radius. Villagers do not — they flee toward the nearest Town Center. Towers auto-attack within range.

**Damage model:** `damage = max(1, attack - armor)`, with a bonus-damage multiplier table (unit class → target class) supplying the counter system. Deterministic, no random rolls — see §19.2.

---

## 13. Map

Maps are procedurally generated from a seed.

**Elements:** grass, forest, water, stone, gold, food, player start, AI start.

**Generation guarantees** (a generated map is rejected and re-rolled if it fails these):

- Both starts have equivalent resources within a fixed radius — mirrored or symmetric layout is acceptable and is the simplest way to guarantee fairness.
- A walkable land path exists between the two starts.
- No start is enclosed by impassable terrain.
- At least one contested resource area exists between the two bases.

**Size:** small enough for mobile — target 96×96 tiles for MVP. Water is decorative and impassable; no naval units.

---

## 14. Fog of War

Three states: **Unknown → Explored → Currently visible.**

Explored terrain and static objects (buildings, resource nodes) remain drawn from memory; enemy units disappear when they leave vision.

**Moved from Milestone 7 (Polish) to Milestone 5.** Reason: fog is not polish. It determines whether scouting matters, it changes what the AI is allowed to know, and it has real rendering cost that must be measured before the performance targets are signed off.

**AI and fog:** the MVP AI is permitted to cheat with full map vision, and this is recorded as a known deviation. Fixing it (giving the AI its own fog state and scouting behavior) is post-MVP. If the AI is caught reacting to invisible player actions in playtests, add a reaction delay rather than a full vision model.

---

## 15. AI

The MVP AI does not need to be sophisticated. It needs to be a functional opponent that loses believably.

```
Gather resources → Build houses → Produce villagers
→ Build military buildings → Advance age → Produce army → Attack
```

**Implementation notes**

- The AI issues the **same commands through the same command queue** as the player (§19.3). It never mutates simulation state directly. This is what makes it swappable for a network peer later.
- Runs as a behavior sequence with priorities, evaluated on a slow cadence (§20).
- Must include a villager-to-military ratio target, a population-based attack trigger, and a retreat/rebuild response when its army is destroyed.
- AI personalities (aggressive / economic / defensive) are post-MVP.

---

## 16. Controls

### 16.1 Touch input resolution — **corrected from v0.1**

The original draft assigned one-finger drag to *both* camera panning and box selection. Resolved as follows:

| Gesture | Result |
|---|---|
| Drag starting on **empty terrain** | Pan camera |
| Drag starting on **an owned unit** | Box selection |
| Tap own unit | Select |
| Tap own building | Select, show production panel |
| Tap terrain (with units selected) | Move |
| Tap enemy (with units selected) | Attack |
| Tap resource node (villagers selected) | Gather |
| Double-tap own unit | Select all units of that type on screen |
| Pinch | Zoom |
| Long-press | Contextual command menu (fallback for ambiguous cases) |

Touch targets are minimum 44×44 px regardless of zoom level. Unit hit areas are inflated beyond their sprite bounds so small units remain tappable.

### 16.2 Required quality-of-life controls

Without these an RTS is unplayable at speed. These are requirements, not polish:

- **Idle villager button** with count badge — cycles to the next idle villager.
- **Select all military** button.
- **Control groups** — desktop via number keys; mobile via long-press on a group slot.
- **Town Center jump** button — centers camera on the TC.
- **Minimap tap-to-jump.**

### 16.3 Desktop

Left click select, right click contextual command, drag box-select, mouse wheel zoom, WASD/arrow camera, edge scrolling, number-key control groups, hotkeys for build menu and production.

Desktop and mobile controllers are two input adapters emitting the same commands into the same queue. There is one game implementation.

### 16.4 Mobile browser realities

- Lock to landscape orientation; show a rotate prompt in portrait.
- `touch-action: none` and `user-select: none` on the canvas to eliminate the 300 ms tap delay, scroll hijack, pull-to-refresh, and text selection.
- Auto-pause on `visibilitychange` (rAF is throttled in background tabs; an unpaused sim would desync from wall-clock and could fast-forward on return).
- Prevent accidental back-navigation and context menus on the canvas.
- Assume thermal throttling in matches over ~10 minutes; performance targets are measured on a warm device, not a cold one.

---

## 17. User Interface

```
┌─────────────────────────────┐
│ 🍖 250  🪵 180  🟡 90  🪨 50 │  Pop 12/20   Age I
├─────────────────────────────┤
│                             │
│          GAME MAP           │
│                             │
│                    ┌──────┐ │
│  [idle: 3]         │ MAP  │ │
│                    └──────┘ │
├─────────────────────────────┤
│ Selected: 4 Villagers       │
│ [Move] [Build] [Stop]       │
└─────────────────────────────┘
```

Requirements: resource bar always visible; population shown with current/cap and a visible warning when capped; age indicator; idle-villager badge; minimap with viewport rectangle; selection panel that collapses when nothing is selected so the world is not obscured; production queue visible on selected buildings with progress.

Notification needs (text or icon, top of screen): "population capped", "under attack" (with minimap ping), "insufficient resources", "age advanced".

---

## 18. Game States

```
Main Menu → New Game → Map Generation → Game
                                          ├── Pause
                                          ├── Settings
                                          └── Surrender
                                          ↓
                              Victory / Defeat → Results → New Game
```

The Results screen must offer **Play Again** as the primary action with no intermediate menus — this is directly tied to the MVP success criterion.

---

## 19. Technical Architecture

### 19.1 Stack

TypeScript + Phaser + Vite. React optional, and only for non-game UI (menus, settings). If React is used, it never renders inside the game loop.

```
src/
├── simulation/          # deterministic, zero rendering dependencies
│   ├── Game.ts
│   ├── GameState.ts
│   ├── Entity.ts
│   ├── Unit.ts
│   ├── Building.ts
│   ├── Resource.ts
│   ├── Economy.ts
│   ├── Combat.ts
│   ├── Technology.ts
│   ├── Command.ts
│   ├── CommandQueue.ts
│   ├── Random.ts        # seeded PRNG
│   └── AI.ts
│
├── data/                # balance JSON (units, buildings, tech, costs)
│
├── map/
│   ├── MapGenerator.ts
│   ├── Tile.ts
│   ├── FlowField.ts
│   ├── Pathfinding.ts
│   └── SpatialGrid.ts
│
├── rendering/
│   ├── GameScene.ts
│   ├── UnitRenderer.ts
│   ├── BuildingRenderer.ts
│   ├── MapRenderer.ts
│   └── FogRenderer.ts
│
├── input/
│   ├── TouchController.ts
│   ├── MouseController.ts
│   └── CommandEmitter.ts
│
├── ui/
│   ├── ResourceBar.ts
│   ├── SelectionPanel.ts
│   ├── BuildMenu.ts
│   └── Minimap.ts
│
└── main.ts
```

### 19.2 Critical architectural rules

**Rule 1 — The simulation must not import Phaser.** Enforced with an ESLint `no-restricted-imports` rule on `src/simulation/**` and `src/map/**`. Not a convention; a build failure.

**Rule 2 — The simulation is deterministic.** Same seed + same command sequence = same result, on every machine, every time.

- No `Math.random()` anywhere in `simulation/` or `map/` — seeded PRNG only, also lint-enforced.
- No `Date.now()` or wall-clock reads in the simulation. Time is tick count.
- No iteration over unordered structures where order affects outcome. Entities are stored in stable, insertion-ordered collections keyed by monotonic integer ID.
- Prefer integer or fixed-point math for positions and combat; if floats are used, accept that cross-platform lockstep will need revisiting before multiplayer.

**Rule 3 — Fixed timestep.** The simulation advances at a single fixed rate (**20 Hz**), decoupled from rendering via an accumulator. Rendering interpolates between the last two simulation states.

This **replaces the v0.1 multi-rate design** (movement 20–30 Hz, combat 10–20 Hz, AI 2–5 Hz). Multiple independent simulation rates make determinism and later lockstep networking effectively impossible. The cost saving is preserved by *staggering* work across ticks instead: combat resolves every 2nd tick, AI evaluates one subsystem per tick on a rotating schedule, pathfinding requests are budgeted per tick. Same performance profile, one clock.

**Rule 4 — All intent is a command.** Player input, AI decisions, and (later) network messages all produce `Command` objects that enter a queue and are applied at a tick boundary. Nothing mutates `GameState` directly. Enforced by keeping mutation methods internal to the simulation module.

```
Input adapter ─┐
AI            ─┼→ CommandQueue → tick(N) → GameState → Renderer → Phaser
Network (later)┘
```

**Rule 5 — GameState is serializable.** Plain data, no class instances holding callbacks or references to renderers. Required for IndexedDB saves (§21) and for multiplayer state sync later. `structuredClone(state)` must work.

### 19.3 Pathfinding — **new section, was one bullet in v0.1**

This is the highest-risk technical component and it is needed from Milestone 2, not Milestone 4. Villagers walking to trees is pathfinding.

**Approach: two-tier.**

1. **Flow field for group movement.** One Dijkstra-style integration field per destination, computed once, shared by every unit heading there. Cost is per-destination, not per-unit — this is what makes 100 units viable on a phone. Fields are cached and invalidated when terrain or buildings change.
2. **Local steering for collision avoidance.** Units follow the flow field vector and apply short-range separation from neighbours, using a spatial grid for neighbour queries. No per-unit long-range replanning.

**Additional requirements**

- Buildings block movement; placing one invalidates affected flow fields.
- Units are pushed out of a building footprint on placement rather than blocking it.
- Unreachable destination → unit moves as close as possible and stops. It must never freeze or vibrate.
- Path requests are budgeted per tick; excess requests queue rather than spiking frame time.
- **Explicitly avoided:** per-unit A* recalculated on collision. It is the standard naive approach and it will not hold 100 units on a mid-range Android device.

**Spike this before Milestone 2 is scoped.** A standalone prototype of 100 units flow-field pathing across a 96×96 map on a real phone, measured, is a prerequisite. If it fails, unit cap and map size change, and that cascades through the rest of the design.

---

## 20. Performance Targets

**Target devices:** mid-range Android phones (not flagships) and modern desktop browsers. Nominate one specific real device as the reference — targets are meaningless without one.

**MVP targets**

| Metric | Target |
|---|---|
| Simultaneous units | 100 |
| Rendering | 60 FPS where hardware permits; 30 FPS floor on reference device |
| Input response | < 100 ms |
| Simulation tick | 20 Hz fixed, budget < 8 ms per tick |
| Network after load | none required |
| Initial load | < 5 s on 4G |
| Sustained play | targets hold after 10 minutes on a warm (throttled) device |

Work distribution within the fixed 20 Hz tick: combat every 2nd tick, AI subsystems rotated across ticks, pathfinding budgeted per tick. Rendering runs free at display rate with interpolation.

---

## 21. Persistence

Browser storage only.

- **localStorage:** settings, audio and control preferences.
- **IndexedDB:** saved game state.

A save is `{ seed, tickCount, serialized GameState }`. This is only possible because of Rule 5 (§19.2) — serializability is a design constraint on the simulation, not a feature bolted on later.

No account required. Single save slot in MVP.

---

## 22. Art & Audio Assets

**Absent from v0.1, and the most common cause of solo RTS projects stalling.**

**Phase 1 (Milestones 1–5):** placeholder colored shapes and simple sprites. No art blocking on gameplay work.

**Phase 2 (Milestone 6+):** adopt a CC0 or CC-BY 2D asset pack (Kenney, LPC, OpenGameArt). Record licence and attribution in `ASSETS.md` at the time of adoption, not retroactively.

**Constraints to decide before Phase 2** (they bind the renderer):
- Top-down orthogonal vs isometric. **Recommendation: top-down orthogonal** — simpler math, simpler pathfinding-to-screen mapping, simpler touch hit-testing, and it looks intentional on a small screen. Isometric is prettier and materially harder on every axis.
- Sprite sheet vs individual images; texture atlas budget for mobile GPU memory.
- Unit silhouettes must be distinguishable at minimum zoom on a phone screen. Test this with placeholders before committing to art.

**Audio (MVP scope):** unit acknowledgement, attack, building complete, age advanced, victory, defeat, under attack. Ambient loop optional. Mute toggle required and must default to on for the first session — browsers block autoplay and phone users often play muted.

---

## 23. Future Multiplayer Architecture

Not in MVP. The architecture rules in §19.2 exist so that this remains reachable.

```
              Authoritative simulation (server or host)
                      │
              ┌───────┴───────┐
              ↓               ↓
           Player 1        Player 2
           Browser         Browser
```

Clients send commands, never full state:

```
Player 1: MOVE unit 142 → (35, 72)
Player 2: ATTACK unit 88 → unit 142
```

Because determinism, fixed timestep, and the command queue are in place from day one, this becomes a transport and lag-compensation problem rather than a rewrite. **Not to be implemented until single-player is fun.**

---

## 24. MVP Success Criteria

### 24.1 Functional

A first-time player, with no instructions, can:

1. Open a URL and start a game.
2. Select villagers and assign them to gather.
3. Build a house and a military building.
4. Produce military units.
5. Advance to Feudal Age.
6. Find the enemy.
7. Fight the enemy.
8. Win or lose a complete match.

### 24.2 Measurable — **replaces "the player should want another match"**

Measured across **8 first-time playtesters** on their own phones:

| Criterion | Target |
|---|---|
| Complete a match without assistance | ≥ 6 of 8 |
| Time to first gathering villager | < 60 s |
| Time to first military unit | < 6 min |
| Start a second match unprompted | ≥ 5 of 8 |
| Report control confusion (unintended camera pan / selection) | ≤ 2 of 8 |
| Match duration | 10–30 min |
| Sustained ≥ 30 FPS on reference device | 8 of 8 |

The second-match number is the real signal. If it comes in low, the answer is combat depth (cavalry, §10.1) before it is content.

---

## 25. Development Milestones

**Milestone 0 — Foundation & Spikes** *(new, blocking)*
- [ ] Vite + TypeScript + Phaser project, deploying to Vercel
- [ ] Fixed-timestep loop with accumulator, decoupled from render
- [ ] Seeded PRNG; ESLint rules banning Phaser imports and `Math.random()` in `simulation/`
- [ ] Command queue skeleton
- [ ] **Pathfinding spike: 100 units, flow field, 96×96 map, measured on the reference phone**
- [ ] Balance data loaded from JSON

**Milestone 1 — Rendering & Camera**
- [ ] Map rendering, camera pan and zoom
- [ ] Touch controller with the §16.1 gesture resolution
- [ ] Mouse/keyboard controller
- [ ] Landscape lock, `touch-action`, visibility auto-pause

**Milestone 2 — Economy**
- [ ] Villagers, movement using Milestone 0 pathfinding
- [ ] Resource nodes, gathering, carry, drop-off, depletion, auto-retask
- [ ] Resource bar, population, idle-villager indicator

**Milestone 3 — Construction**
- [ ] Ghost placement with validity rules (§9.1)
- [ ] Construction time, multi-villager build, cancel/refund
- [ ] Town Center, House, Farm, Barracks

**Milestone 4 — Military**
- [ ] Production queues, unit selection, box select, control groups
- [ ] Combat: damage, armor, bonus table, cooldown, death
- [ ] Passive aggression, villager flee, tower auto-attack

**Milestone 5 — AI, Fog & Win Conditions**
- [ ] AI issuing commands through the queue
- [ ] Fog of war *(moved here from Polish)*
- [ ] Victory/defeat, results screen, Play Again
- [ ] **First external playtest — 3 people, before ages exist**

**Milestone 6 — Ages**
- [ ] Data-driven age system supporting N ages
- [ ] Feudal Age, Archery Range, Archers, Towers
- [ ] Economic upgrades

**Milestone 7 — Polish & Validation**
- [ ] Art pass, audio, animations
- [ ] Notifications, minimap ping, UI refinement
- [ ] IndexedDB save/load
- [ ] Balance pass
- [ ] **Full 8-person playtest against §24.2**

**Post-MVP queue (in order):** Cavalry + Castle Age · AI without vision cheat · AI personalities · Repair · Tutorial · PWA · Multiplayer

---

## 26. MVP Definition of Done

> A player can open the game on an Android browser, start a procedurally generated match, manage villagers and resources, construct a base, advance to Feudal Age, produce an army, fight a functional AI opponent, and achieve victory or defeat — all without installing anything or connecting to a backend — while the measurable criteria in §24.2 are met.

The priority is gameplay, not content. One good map generator, a handful of units, and a fun AI beat ten civilizations with shallow mechanics.

---

## 27. Open Questions

To be resolved during Milestone 0:

1. **Does the flow-field spike hit target on the reference device?** If not, does the unit cap drop to 60, or the map to 64×64?
2. **Fixed-point or float positions?** Float is faster to build; fixed-point is required for cross-platform lockstep. Decide now or accept a later refactor.
3. **Reference device:** which specific mid-range Android phone are targets measured on?
4. **Farms:** permanent, or do they expire and require rebuilding? Affects mid-game villager management load on a touchscreen.
5. **Population cap:** hard maximum (e.g. 50) as a performance guard, or house-limited only?
6. **Does MVP need a scout unit,** or do villagers scout? Fog makes this matter more than it appears.
