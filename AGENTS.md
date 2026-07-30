# Screeps AI — agent notes

TypeScript Screeps bot built on [Overmind](https://github.com/bencbartlett/Overmind),
compiled via `tsc`/Rollup to `dist/main.js`. Real build system, real
`package.json`, real (thin) test coverage (`tests/ExpansionCampaign.test.ts`).
See README.md for the verified architecture overview — do not trust older
descriptions of a flat `role.*.js`/`colony.manager.js` file layout; that
architecture does not exist in this repo (see
`docs/progressive-ant-supercolony.md` for how that drift happened).

## Runtime environment (Screeps globals — do NOT import or declare)

`Game`, `Memory`, `RawMemory`, `PathFinder`, `RoomPosition`, `_` (lodash),
`BODYPART_COST`, `CREEP_SPAWN_TIME`, all `STRUCTURE_*` / `RESOURCE_*` /
`ERR_*` / `TERRAIN_MASK_*` / `FIND_*` constants are globals. There is no
Node, no `fs`, no `process`. Each tick the engine calls the compiled
`loop()` export in `dist/main.js` once.

## Design philosophy

Target direction is a **progressive ant supercolony** — see
`docs/progressive-ant-supercolony.md` (design/research doc) and
`peaceful-strategy-analysis.md` (economic-denial doctrine). Current code is
still a centralized `Overmind → Overseer → Colony/Overlord` model, same as
stock Overmind — the decentralized per-creep decision-making the design doc
describes is a target, not yet built.

## Build & Deploy

```bash
npm run build             # tsc type-check only, no bundle
npm run push-main         # rollup -c DEST=main      → dist/main.js
npm run push-seasonal     # rollup -c DEST=seasonal
npm run push-pserver      # rollup -c DEST=pserver
npm run push-screepsplus  # rollup -c DEST=screepsplus
npm run deploy             # compile, then cp dist/main.js into the three
                           # local sync folders (screeps.com/default,
                           # screeps.com/seasonal, 127_0_0_1___21025/pserver)
```

## Orchestration chain

`main.ts` → `Overmind.build()/refresh()` (rebuilds/refreshes all `Colony`
objects) → `Overmind.init()/run()` drives `Overseer` (single global
instance, owns every `Directive`+`Overlord` across all colonies, also the
reactive rule engine that spawns Directives for bootstrap emergencies,
defense, nukes, etc.) → each `Colony.init()/run()` drives its own
`HiveCluster`s and utility networks. Full directory-by-directory breakdown
is in README.md's Architecture section — keep both in sync if either
changes.

## `Memory` root keys (verified, `src/declarations/memory.d.ts`)

`tick, build, assimilator, Overmind, profiler, overseer, segmenter,
roomIntel, colonies, creeps, powerCreeps, flags, rooms, spawns, pathing,
constructionSites, stats, combatPlanner, expansionPlanner,
playerCreepTracker, settings`. Subsystems claim their slice via
`Mem.wrap(Memory, 'name', defaultsFn)` (`src/memory/Memory.ts`) — follow
that pattern for new state, don't add ad-hoc root keys. Per-object memory
(creep/flag/room) uses single-letter aliased keys (`MEM` enum) to shrink
serialized size — check `declarations/roomMemory.d.ts` before hand-writing
a new memory field.

## Conventions to follow

- Tabs for indentation (existing files use tabs, not spaces).
- Pathing goes through `movement/Pathing.ts` (CostMatrix-based) +
  `movement/Movement.ts` (per-tick move execution) — don't call
  `creep.moveTo` directly.
- Classes are commonly annotated `@profile` (`profiler/decorator.ts`) for
  CPU accounting — follow the pattern used by sibling classes in the same
  directory rather than guessing.
- Exact per-subsystem conventions beyond this (logging helpers, periodic-work
  cadences, CPU budget gating specifics) haven't been re-verified against
  the real code yet after the README/AGENTS cleanup — check the relevant
  source file directly rather than trusting stale assumptions here.

## Adding a new job (replaces old "adding a new role" checklist)

There is no `role.<name>.js` file-per-role system. Verified pattern from
`overlords/core/worker.ts` + `Overlord.ts` + `Colony.ts`:

1. New job = a new class extending `Overlord` (`overlords/Overlord.ts`),
   constructor takes an `OverlordInitializer` (typically `colony`). Follow
   an existing overlord in the same directory as a template (e.g.
   `overlords/core/worker.ts`) rather than starting from scratch.
2. **Core overlords** (always-on, one per colony) are instantiated directly
   in `Colony.ts` (`new WorkerOverlord(this)` etc., keyed into
   `this.overlords`, around the block that builds `default`/`work`/
   `logistics`/`scout`).
3. **Job-specific overlords** (situational — colonize, guard, claim, ...)
   are instead owned/created by a `Directive` (`directives/`), not
   registered in `Colony.ts` — check an existing directive in the same
   category first (`directives/colony/`, `directives/defense/`, etc.).
4. Priority constants live in `priorities/priorities_overlords.ts`; creep
   body setups in `creepSetups/setups.ts` (`Roles`/`Setups`).


<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
