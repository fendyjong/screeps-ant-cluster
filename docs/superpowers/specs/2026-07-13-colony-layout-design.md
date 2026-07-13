# Colony Layout — Anchor, Barriers, and Structure Lifecycle

**Date:** 2026-07-13
**Status:** Draft
**Motivation:** Current `Architect.ts` (670 lines) generates layouts by BFS from room center, places barriers adjacent to structures, and relies on a simple 100-tick swap-plan cycle with no demolition or safety checks. Overmind uses distance-transform anchor selection, min-cut barrier planning, and staggered lifecycle management. We adopt the algorithms while keeping our algorithmic (non-hardcoded) layout generation.

## Architecture

Split `Architect.ts` into 4 focused modules:

```
src/colony/Architect.ts        — planLayout(), planSwap(), BUILD_PRIORITIES, isSafeToDestroy
src/colony/AnchorPlanner.ts    — distance transform + best-anchor scoring
src/colony/BarrierPlanner.ts   — min-cut barrier placement
src/colony/Lifecycle.ts        — staggered demolish/build/safety checks
```

## 1. Anchor Planner (`AnchorPlanner.ts`)

**Problem:** Current `findSpawnPosition` picks the first walkable tile near (25,25). In rooms with irregular terrain (swamp clusters, walls near center, sources far from center), this produces a suboptimal bunker position — creeps waste ticks pathing to distant sources.

**Approach:** Distance transform — find the tile where a radius-6 bunker fits and minimizes total path length to all sources + controller.

### Algorithm

```
1. BFS from all wall tiles outward, recording distance-to-wall for each tile
2. Filter tiles where distance-to-wall >= 7 (bunker radius + 1 margin)
3. Check each candidate: translate hardcoded bunker coords to candidate anchor,
   verify no terrain-wall collision inside the translated bunker footprint
4. Score surviving candidates: sum of PathFinder path lengths from anchor to
   each source + controller (using ignoreStructures terrain-only pathing)
5. Return candidate with minimum score
```

**Output:** `RoomPosition` (best anchor). Called once from `planLayout` — anchor replaces current `findSpawnPosition`.

**Why not Overmind's code verbatim:** Overmind uses a hardcoded bunker footprint (radius 6 with specific structure positions). We adopt the footprint check (bunker fits in radius-6 circle) but our `planLayout` still generates the actual positions algorithmically from the anchor.

## 2. Barrier Planner (`BarrierPlanner.ts`)

**Problem:** Current `computeWallPositions` places walls on all walkable tiles adjacent to any structure position. This produces too many ramparts, irregular perimeters, and gaps that don't seal the bunker.

**Approach:** Min-cut on a grid graph — find the minimal set of tiles whose removal separates the bunker interior from room edges.

### Algorithm

Adapt from Overmind's `algorithms/minCut.ts`. Core algorithm is max-flow (Dinic's) on a room-sized grid:

```
1. Build grid graph (50x50 nodes + source/sink)
2. Source edge: interior tiles (within bunker radius of anchor, walkable)
   → infinite capacity
3. Sink edge: exterior tiles (room edge perimeter x=0/49, y=0/49)
   → infinite capacity  
4. Internal edges between adjacent tiles:
   - terrain wall      → 0 capacity (already blocked)
   - non-walkable struct → 0 capacity
   - plain             → 1 capacity
   - swamp             → 10 capacity
5. Compute max flow / min cut via Dinic's algorithm
6. Cut tiles = barrier positions (ramparts)
```

**Optimizations:**
- Only compute on zone: [anchor.x - 10, anchor.x + 10] x [anchor.y - 10, anchor.y + 10] (not full 50x50)
- Cache result in `Memory.v1.barrierPlan[roomName]`, invalidate on anchor change
- Override: force barriers under spawn, storage, terminal, towers (critical structures)

**Output:** `RoomPosition[]` for ramparts. Added to `BunkerLayout.ramparts` in `planLayout`.

**Extraction from Overmind:** Overmind's `minCut.ts` implements Dinic's with PCG random graph for performance. We extract the Dinic's implementation, use our terrain cost matrix instead of PCG.

## 3. Lifecycle (`Lifecycle.ts`)

**Problem:** Current cycle runs `planSwap` + `createConstructionSites` every 100 ticks. No demolition ever happens — builders never destroy misplaced structures. Energy gate blocks site placement needlessly.

**Approach:** Staggered check cycle, separated demolish and build passes, RCL-aware safety gates.

### Interface

```typescript
function shouldRecheck(room: Room, offset?: number): boolean
function demolishMisplaced(room: Room, plan: SwapPlan): void
function buildMissing(room: Room, plan: SwapPlan): void
```

### Demolish pass (`demolishMisplaced`)

- Iterate `plan.destroy` (structure IDs)
- Max 5 demolition operations per tick
- Safety checks before each:
  - **Spawn:** Only destroy if another spawn exists OR `EnergyBudget >= 15000` + total WORK parts * TTL across all builder creeps >= 15000 (can rebuild)
  - **Storage:** Only destroy if RCL >= 4 AND a replacement storage site is already placed
  - **Terminal:** Only destroy if storage exists AND non-energy resources evacuated (< 1000)
  - **Extensions/other:** Destroy unconditionally (cheap to rebuild)
- On success, remove from `plan.destroy`, set `plan.state = 'destroying'`

### Build pass (`buildMissing`)

- Iterate `plan.build` sorted by `BUILD_PRIORITIES`
- Max 10 construction sites per tick (scales with RCL: 5 at RCL 1-3, 10 at RCL 4+, up to 25 at RCL 8)
- Skip if existing site or structure already at position
- No energy gate (sites cost 0 energy; builders pay energy during construction)
- On success, remove from `plan.build`, set `plan.state = 'building'`

### Scheduling in main.ts

```typescript
// After getTerrainMatrix, before hatcheryProcess
if (shouldRecheck(room)) {
    demolishMisplaced(room, swapPlan);
} else if (shouldRecheck(room, 1)) {
    buildMissing(room, swapPlan);
}
```

`shouldRecheck` returns true every `100 / (RCL + 1)` ticks, offset by `room.name` hash to spread across ticks.

### Removed from createConstructionSites

- Energy gate (`room.energyAvailable < cost * 0.5`): removed (costs 0 energy to place site)
- 100-tick gate: replaced by staggered lifecycle
- `STRUCTURE_COSTS` constant: no longer referenced

## File Structure (final)

```
src/colony/Architect.ts        — planLayout, planSwap, isSafeToDestroy, BunkerLayout, SwapPlan
src/colony/AnchorPlanner.ts    — findBestAnchor(room): RoomPosition
src/colony/BarrierPlanner.ts   — computeBarriers(room, anchor): RoomPosition[]
src/colony/Lifecycle.ts        — shouldRecheck, demolishMisplaced, buildMissing
```

## Integration

- `planLayout` calls `findBestAnchor(room)` instead of `findSpawnPosition(roomName)`
- `planLayout` calls `computeBarriers(room, core.anchor)` and stores result as `core.ramparts`
- `planLayout` no longer calls `computeWallPositions` or `computeRampartPositions` (replaced by BarrierPlanner)
- `main.ts` replaces `createConstructionSites(room)` + `drainPendingRoads(room)` with lifecycle calls
- `planSwap` still generates the diff; lifecycle executes it over ticks
- `computeWallPositions` function is deleted (barriers handled by min-cut)