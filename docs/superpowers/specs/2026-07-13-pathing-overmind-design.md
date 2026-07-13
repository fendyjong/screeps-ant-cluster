# Pathing Overmind — Movement System Redesign

**Date:** 2026-07-13
**Status:** Draft
**Motivation:** Current pathing is a thin `creep.moveTo()` wrapper with cost-callback. Creeps bump walls, exit rooms, block each other in corridors, and re-path every tick. Overmind's movement module solves these with direct `PathFinder.search()`, path caching, body-aware costs, and priority creep pushing.

## Architecture

Replace the 161-line `Pathing.ts` with a 3-file module:

```
src/lib/Pathing.ts      — public API (moveTo export), path caching, creep pushing
src/lib/PathFinder.ts   — direct PathFinder.search() wrapper, room callback, cost matrices, route finding
src/lib/helpers.ts      — terrain cost computation, coord utilities
```

## 1. Cost Matrix System

Two matrix types per room, cached in `Memory.v1.pathing.costCache`:

**Terrain matrix** (static, computed once per room):
- `plain = 2`, `swamp = 10`, `wall = 255`
- Stored serialized, never changes

**Full-structure matrix** (rebuilt on structure change):
- Starts from terrain matrix clone
- `road = 1`, `rampart = 1` (own ramparts are walkable)
- `container = 1`, `non-walkable structure = 255`
- Invalidated by structure signature hash (same as current `computeStructSig`)
- TTL: 10 ticks (reduces CPU, structures change infrequently)

**Body-aware terrain costs:**
- `weightedParts = WORK + ATTACK + RANGED_ATTACK + HEAL + CLAIM + TOUGH + carriedEnergy`
- `moveParts = MOVE + boosts`
- `plainCost = ceil(weightedParts / moveParts)`
- `swampCost = 5 * plainCost`
- Computed per creep, passed to `PathFinder.search()` as `plainCost`/`swampCost`
- Light creeps (scouts) path swamp cheap, heavy creeps (tanks) pay more

## 2. PathFinder Wrapper

`PathFinder.findPath(origin, destination, opts)` replaces `creep.moveTo()`:

```typescript
interface MoveOpts {
    maxRooms?: number;          // default 1 for owned-room roles
    preferHighway?: boolean;    // bias toward highway rooms
    avoidHostile?: boolean;     // skip rooms with enemy towers
    ignoreCreeps?: boolean;     // default true (path caching handles collisions)
    range?: number;             // default 1
    maxOps?: number;            // default 20000
    repath?: number;            // 0-1 probability of re-path per tick
}
```

**Room callback:**
- For owned rooms: full-structure matrix
- For visible unowned rooms: terrain matrix (no structure data)
- For invisible rooms: return boolean (true = passable, false = blocked)
- Rooms marked `memory.avoid = true` + not origin/destination → return false

**Route finding (multi-room):**
- If `roomDistance > 2` or `maxRooms > 1`: call `Game.map.findRoute(origin, destination)`
- Build `allowedRooms` dict from route result
- Exclude rooms marked avoid (unless origin/destination)
- Highway bias: prefer highway rooms for long-distance travel

## 3. Path Caching

**Serialized path format:** direction string stored in `creep.memory._path`

```
"35812234..."  — each digit is a DirectionConstant (1-8)
```

**Lifecycle:**
1. No path or path consumed → call `findPath()` → serialize result as direction string
2. Each tick: read first char, `creep.move(direction)`, remove char from string
3. Re-path triggers:
   - Path string empty (arrived)
   - Stuck detected (same coord 2+ ticks in a row)
   - `Math.random() < opts.repath`
   - Destination changed
4. Stuck detection: store `_lastPos` and `_stuckTicks` in creep memory (same as current)

**CPU benefit:** `PathFinder.search()` runs once per ~10 ticks per creep instead of every tick. Path traversal is O(1) per tick.

## 4. Creep Pushing

**Priority table:**
```typescript
const MOVE_PRIORITY: Record<string, number> = {
    harvester: 1,    // must keep harvesting
    defender:  2,    // must defend
    hauler:    3,
    builder:   4,
    upgrader:  5,
    scout:     9,    // lowest — can wait
}
```

**Algorithm:**
1. Before moving, check if next position has a creep
2. If blocked: compare priorities
3. Higher priority → push: `otherCreep.move(pushDir)` where pushDir is toward an available neighbor
4. Prepend opposite direction to pushed creep's path (so it resumes after push)
5. Set `otherCreep.blockMovement = true` for rest of tick (prevents chain reactions)
6. Lower priority → wait: return `ERR_BUSY`, don't move this tick

**Result:** Harvesters push through haulers. Defenders push through upgraders. Scouts always yield. No more corridor deadlocks.

## 5. Integration

**Public API unchanged:**
```typescript
// src/lib/Pathing.ts
export function moveTo(creep: Creep, target: HasPos | RoomPosition, opts?: MoveOpts): ScreepsReturnCode
```

All existing roles continue calling `moveTo(creep, target)` with no changes. Remote roles pass `{maxRooms: 3}`.

**Deleted from current Pathing.ts:**
- `getOrBuildCostMatrix()` — replaced by new cost matrix system
- `giveWayIfStuck()` — replaced by creep pushing
- `recordTraffic()` — moved to separate module (traffic heatmap for road placement)
- Friendly creep cost-8 setting — removed (handled by pushing)
- `computeStructSig()` — kept but moved to PathFinder.ts

**Removed from current codebase:**
- `src/lib/TerrainMatrix.ts` — terrain matrix `getTerrainMatrix()` + `isWalkable()` move into `PathFinder.ts`. The analysis functions (`findChokepoints`, `findPerimeterPositions`, `calculateCoverage`, `findOptimalTowerPositions`) stay in a trimmed `TerrainMatrix.ts` which imports `getTerrainMatrix` from PathFinder.

**Exports from PathFinder.ts:**
- `getTerrainMatrix(roomName): CostMatrix` — terrain-only matrix (used by Architect for layout planning)
- `isWalkable(matrix, x, y): boolean` — terrain walkability check
- `findPath(origin, destination, opts): PathFinderPath` — core pathfinder
- `getStructureMatrix(room): CostMatrix` — full structure cost matrix
- `computeStructSig(room): number` — structure change signature
- `findRoute(origin, destination, opts): AllowedRooms` — multi-room routing

## File Structure (final)

```
src/lib/Pathing.ts      — moveTo(), path caching, push logic, stuck detection
src/lib/PathFinder.ts   — findPath(), room callback, cost matrices, route finding, struct sig
src/lib/helpers.ts      — getTerrainCosts(), normalizePos(), isExit(), sameCoord()
```

## Error Codes

| Return | Meaning |
|--------|---------|
| `OK` | Moved successfully |
| `ERR_TIRED` | Has fatigue |
| `ERR_BUSY` | Blocked by lower-priority creep |
| `ERR_NO_PATH` | Pathfinder returned incomplete |
| `ERR_NOT_IN_RANGE` | Already at destination |
| `NO_ACTION` (-20) | Arrived, no move needed |