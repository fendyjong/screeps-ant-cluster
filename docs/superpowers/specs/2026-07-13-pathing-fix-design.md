# Pathing Validation + Dead Code Cleanup — Design Spec

**Date:** 2026-07-13

## Problems

1. **Roads unused**: `buildCostMatrix` sets road cost = 1, but terrain matrix also sets plain = 1. Identical cost — pathfinder sees no benefit to roads.
2. **Harvester picks farthest source**: `findSource` returns the first source with energy > 0 (deterministic room.find order), not the closest.
3. **Terrain cache has no version**: cached matrices persist across code changes. Future cost tweaks leave stale matrices in Memory.
4. **Dead code**: 31 `.ts` files and 28 `.js` files from the v1 codebase are not imported by the bundle. Waste of disk space and confusion.

## Fixes

### Fix 1: Terrain cost recalibration

**File:** `src/lib/TerrainMatrix.ts`

Current → new costs:

| Terrain | Old | New |
|---------|-----|-----|
| Plain | 1 | 2 |
| Swamp | 5 | 10 |
| Wall | 255 | 255 |

Road overlay in `buildCostMatrix` stays at 1. Now roads (1) are cheaper than plain (2), so pathfinder prefers them.

`isWalkable()` checks `< 255` — still correct for all non-wall tiles.

### Fix 2: Terrain cache version stamp

**File:** `src/lib/TerrainMatrix.ts`

Add version constant. Store version alongside serialized matrix. On read, check match. Regenerate on mismatch.

```ts
const TERRAIN_VERSION = 1

interface TerrainCacheEntry {
  matrix: number[]
  tick: number
  version: number
}

export function getTerrainMatrix(roomName: string): CostMatrix {
  ensurePathingMemory()
  const ns = Memory[CURRENT_NS]
  const cached = ns.pathing.terrain[roomName]
  if (cached && cached.version === TERRAIN_VERSION) {
    return PathFinder.CostMatrix.deserialize(cached.matrix)
  }
  const matrix = generateTerrainMatrix(roomName)
  ns.pathing.terrain[roomName] = {
    matrix: matrix.serialize(),
    tick: Game.time,
    version: TERRAIN_VERSION,
  }
  return matrix
}
```

Future cost changes: bump `TERRAIN_VERSION`. All cached matrices auto-regenerate on next access.

### Fix 3: Harvester picks closest source

**File:** `src/roles/Harvester.ts`

Replace `findSource`:

```ts
function findSource(creep: Creep): Source | null {
  const sources = creep.room.find(FIND_SOURCES)
  const active = sources.filter(s => s.energy > 0)
  if (active.length === 0) return sources[0] || null
  return creep.pos.findClosestByPath(active)
}
```

If all sources depleted, returns the closest (by path) among all sources. Otherwise picks closest with energy.

### Fix 4: Delete dead code

**Files to DELETE** — 31 `.ts` files in `src/` root:

```
role.harvester.ts  role.hauler.ts  role.builder.ts  role.upgrader.ts
role.attacker.ts  role.healer.ts  role.defender.ts
role.ranged_escort.ts  role.claimer.ts  role.scout.ts
utils.pathing.ts  utils.metrics.ts  utils.stats.ts  utils.squad.ts
economy.factory.ts  economy.market.ts  economy.labs.ts  economy.links.ts
power.logic.ts  power.operator.ts
strategy.map.ts  war.room.ts  colony.manager.ts
auto.spawn.ts  auto.construct_site.ts
debug.report.ts  debug.performance.ts
globals.ts
```

28 `.js` files at root (same names, `.js` extension):
Same list, plus `dist/main.js` (build artifact, not loaded by Screeps client).

**Files KEPT** — all used by `main.ts` bundle:
- `src/main.ts`
- `src/colony/Architect.ts`, `src/colony/Colony.ts`, `src/colony/Goal.ts`
- `src/roles/Harvester.ts`, `src/roles/Hauler.ts`, `src/roles/Builder.ts`, `src/roles/Upgrader.ts`
- `src/spawn/Spawner.ts`, `src/spawn/Body.ts`
- `src/lib/Memory.ts`, `src/lib/TerrainMatrix.ts`, `src/lib/Pathing.ts`
- `src/types/index.ts`
- `main.js` (compiled bundle, actively deployed)
- `AGENTS.md`, `.gitignore`, `rollup.config.mjs`, `tsconfig.json`, `package.json`
- `docs/` directory
- `.git/` directory