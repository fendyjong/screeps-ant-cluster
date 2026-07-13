# Codebase Restructure — Design Doc

## Scope

Full restructure of the Screeps AI TypeScript codebase. No behavior changes.
Only file splits, moves, renames, type hardening, and dead code removal.

## 1. Memory Type System

**Problem:** 20+ `(Memory.v1 as any)` casts across `main.ts`, `HUD.ts`,
`PathFinder.ts`, `Pathing.ts`, `Hatchery.ts`, `Queen.ts`, `Cashflow.ts`.
`CreepMemory` and `RoomMemory` missing runtime fields.

**Plan:** Extend the `Memory` global declaration in `types/index.ts`:

- Add `pathing` subtree: `terrain`, `structureCache`, `traffic`, `pendingRoads`
- Add `cashflow` per-room
- Add `events` (hostile, expansion)
- Add `hud` (cpuTick, lastThreat)
- Add `_prevTotalEnergy`, `_prevProgress` (tick-to-tick tracking)
- Add `_prevTotalEnergyCache` (legacy JS pattern)
- Add `_stuckTicks`, `_lastPos`, `_path` to `CreepMemory`
- Ensure `RoomMemory.layout` is fully typed
- Remove all `(Memory.v1 as any)` — direct typed access

**Files touched:** `types/index.ts`, `main.ts`, `HUD.ts`, `PathFinder.ts`,
`Pathing.ts`, `Hatchery.ts`, `Queen.ts`, `Cashflow.ts`

## 2. Architect Decomposition

**Problem:** `colony/Architect.ts` is 606 lines with 5 responsibilities.

**Plan — split into 3 files:**

- `colony/BuildCosts.ts` — `REBUILD_COSTS`, `BUILD_PRIORITIES`,
  `sortByPriority()`, `isSafeToDestroy()`
- `colony/LayoutPlanner.ts` — `BunkerLayout` interface, zone carving
  functions, `planLayout()`
- `colony/SwapPlanner.ts` — `SwapPlan` interface, `planSwap()`

No logic changes. Pure file split.

## 3. main.ts Decomposition

**Problem:** `main.ts` is 227 lines doing 8+ things in the tick loop.

**Plan — extract 3 modules into `colony/`:**

- `colony/Watchers.ts` — `hostileWatcher(room)`, `expansionWatcher(room)`
- `colony/RoadDrainer.ts` — `drainPendingRoads(room)`
- `colony/LayoutWatcher.ts` — `recheckLayout(room)`

`main.ts` becomes a thin orchestrator (~80 lines) with no implementation details.

## 4. File Moves + Renames

- `hatchery/Queen.ts` → `colony/Queen.ts`
- `colony/Lifecycle.ts` → `colony/SwapExecutor.ts`
- `lib/TerrainMatrix.ts` → `colony/TowerPlanner.ts` (prune 3 unused functions)

## 5. Dead Code Removal

From `lib/TerrainMatrix.ts` (now `colony/TowerPlanner.ts`):
- Remove `findChokepoints()` (unused)
- Remove `findPerimeterPositions()` (unused)
- Keep `calculateCoverage()` (used by `findOptimalTowerPositions`)
- Keep `findWalkablePositions()` (potentially called externally)
- Keep `findOptimalTowerPositions()` (used by `LayoutPlanner`)

## 6. Final Directory Structure

```
src/
  main.ts
  colony/
    AnchorPlanner.ts
    BarrierPlanner.ts
    BuildCosts.ts
    LayoutPlanner.ts
    LayoutWatcher.ts
    Queen.ts
    RoadDrainer.ts
    SwapExecutor.ts
    SwapPlanner.ts
    TowerPlanner.ts
    Watchers.ts
  hatchery/
    Body.ts
    Hatchery.ts
    Request.ts
  lib/
    Cashflow.ts
    HUD.ts
    helpers.ts
    Memory.ts
    PathFinder.ts
    Pathing.ts
    TaskManager.ts
  roles/
    Builder.ts
    Harvester.ts
    Hauler.ts
    Upgrader.ts
  types/
    index.ts
```

## Non-Goals

- No behavior changes
- No API changes to roles (they still call same TaskManager/Pathing functions)
- No test framework (Screeps has none)
- No TS strict mode upgrade (separate effort)
- No renaming of PathFinder/Pathing (separate concern)
