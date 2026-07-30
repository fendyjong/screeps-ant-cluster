# Screeps Bot — Progressive Ant Supercolony

A Screeps AI built on [Overmind](https://github.com/bencbartlett/Overmind)
(TypeScript), extended with this project's own autonomous-growth and
expansion systems.

## Philosophy

Target direction is a **progressive ant supercolony**: rooms that stay
connected and economically pooled like a real polydomous ant colony, grow
exponentially, and — eventually — let individual creeps/overlords act on
local quorum-sensed thresholds instead of everything being computed
top-down. Full research and design rationale lives in
[`docs/progressive-ant-supercolony.md`](docs/progressive-ant-supercolony.md);
economic-denial ("starve the rivals") doctrine lives in
[`peaceful-strategy-analysis.md`](peaceful-strategy-analysis.md).

**Current reality check**: the orchestration model described below
(`Overmind` → `Overseer` → `Colony`/`Overlord`) is centralized, same as
stock Overmind. The decentralized, per-creep quorum-decision vision in the
design doc is a target, not yet built — see that doc's gap analysis for
what's missing.

## Architecture

```
src/
  main.ts                 ← entry point; Screeps calls loop() once per tick
  Overmind_obfuscated.js   ← compiled top-level singleton (global.Overmind);
                             source Overmind.ts is intentionally not checked
                             in — standard upstream Overmind practice, not
                             specific to this fork
  Overseer.ts              ← single global instance (Overmind.overseer).
                             Owns every Directive + Overlord across ALL
                             colonies, runs their init()/run() in priority
                             order. Also the reactive rule engine: spawns
                             Directives for bootstrap emergencies, invasion/
                             nuke defense, power-bank mining, auto-poison,
                             new-outpost discovery, safe mode.
  Colony.ts                ← one instance per owned room + its outposts.
                             Owns that room's HiveClusters, utility networks,
                             and core Overlords. Tracks DEFCON and
                             ColonyStage (Larva/Pupa/Adult).
  hiveClusters/             ← structural "organs": Hatchery, CommandCenter,
                             EvolutionChamber, UpgradeSite, SporeCrawler
  overlords/                ← "process" layer: one job per subclass (worker,
                             queen, transporter, miner, scout, guard,
                             claimer, dismantler, ...)
  directives/                ← flag-backed process-table entries (colonize,
                             outpost, guard, bootstrap, nukeResponse, ...),
                             created/removed by the Overseer
  strategy/                  ← colony-external decisions: ExpansionEvaluator/
                             ExpansionPlanner/ExpansionCampaign, CombatPlanner,
                             NukePlanner
  logistics/                 ← resource movement: LogisticsNetwork,
                             LinkNetwork, RoadLogistics, TerminalNetwork/
                             TradeNetwork (market), Energetics (energy policy)
  zerg/                       ← wrappers around raw Creep/PowerCreep (Zerg,
                             CombatZerg, PowerZerg, Swarm)
  tasks/                      ← reusable creep-action state machines (harvest,
                             build, repair, upgrade, attack, heal, ...),
                             persisted in creep memory across ticks
  intel/                      ← cached world knowledge: RoomIntel, CombatIntel
  movement/                   ← CostMatrix pathfinding (Pathing) + per-tick
                             move execution (Movement)
  roomPlanner/                 ← structure placement: static hand-authored
                             layouts (bunker/commandCenter/hatchery) +
                             DynamicPlanner (algorithmic, see below)
  resources/                   ← Abathur (lab reaction-chain planner),
                             mineral/boost tier tables
  console/                     ← OvermindConsole: in-game console commands
```

### Tick flow

`main.ts` → `Overmind.build()`/`refresh()` (rebuilds/refreshes all `Colony`
objects) → `Overmind.init()`/`run()` drives `Overseer` → `Overseer` drives
every `Directive` and `Overlord` → each `Colony.init()`/`run()` drives its
own `HiveCluster`s and utility networks.

## This fork's systems

What's actually new here on top of stock Overmind — with honest status,
not aspirational:

| System | File | Status |
|---|---|---|
| **Adaptive stockpile governor** | `logistics/Energetics.ts` | **Live.** `stockpileBenchmark(colony)` computes a reserve floor (creep-replacement cost + income buffer + tower reserve + build backlog) and derives a `spendFactor` that `overlords/core/worker.ts` uses to scale worker headcount, and that `ExpansionPlanner` uses to gate expansion. |
| **Dynamic zone planner** | `roomPlanner/DynamicPlanner.ts` | **Built, not wired in.** Scores candidate anchor tiles on logistics distance, defensibility (min-cut rampart perimeter), buildable capacity, terrain. `RoomPlanner.ts` still only calls the static layout files. |
| **Safe expansion campaign engine** | `strategy/ExpansionCampaign.ts` + `ExpansionPlanner.ts` | **Dry-run only.** Full state machine (discover → validate → escrow → probe → claim → bootstrap → stabilize → independent), gated on stockpile state / spawn capacity / CPU bucket / route safety, invoked every 1000 ticks in Automatic mode — but `dryRun` is hard-coded `true`; it logs what it *would* do and never claims or spawns for real. |

## Memory

Root shape declared in `src/declarations/memory.d.ts`: `tick, build,
assimilator, Overmind, profiler, overseer, segmenter, roomIntel, colonies,
creeps, powerCreeps, flags, rooms, spawns, pathing, constructionSites,
stats, combatPlanner, expansionPlanner, playerCreepTracker, settings`.
Defaults instantiated once per global reset by `Mem.format()`
(`src/memory/Memory.ts`); subsystems claim their slice via
`Mem.wrap(Memory, 'name', defaultsFn)`. Per-object memory (creep/flag/room)
uses single-letter aliased keys (`MEM` enum) to shrink serialized size.

## Build & Deploy

```bash
npm run build            # tsc type-check only (tsc-out/, not the bundle)
npm run push-main        # rollup -c, DEST=main      → dist/main.js
npm run push-seasonal    # rollup -c, DEST=seasonal
npm run push-pserver     # rollup -c, DEST=pserver
npm run push-screepsplus # rollup -c, DEST=screepsplus
npm run deploy           # compile, then cp dist/main.js into
                          #   screeps.com/default, screeps.com/seasonal,
                          #   127_0_0_1___21025/pserver
```

Destinations are keyed in `screeps.js`; `rollup.config.js` reads `src/main.ts`
and emits `dist/main.js` (CommonJS, no sourcemap). There is no test
framework beyond `tests/ExpansionCampaign.test.ts` — verify most changes by
monitoring in-game console and Memory.
