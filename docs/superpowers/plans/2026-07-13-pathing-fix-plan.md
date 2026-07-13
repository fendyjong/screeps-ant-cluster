# Pathing Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix road costs, add persistent path cache with structure-change detection, add traffic heatmap for auto road building, fix harvester source selection, add give-way logic, delete dead code.

**Architecture:** TerrainMatrix.ts gets versioned cache + recalibrated costs. Pathing.ts gets persistent cost matrix cache with structSig-based invalidation + traffic heatmap + give-way. Harvester.ts gets source load-balancing. Dead `.ts`/`.js` files deleted.

**Tech Stack:** TypeScript, Screeps globals, existing terrain matrix

---

### Task 1: Recalibrate terrain costs + add cache version stamp

**Files:**
- Modify: `src/lib/TerrainMatrix.ts`

- [ ] **Step 1: Change terrain cost constants and add version**

Replace the `TERRAIN_COSTS` constant and add version:

```ts
const TERRAIN_COSTS = {
  plain: 2,
  swamp: 10,
  wall: 255,
};

const TERRAIN_VERSION = 1;
```

- [ ] **Step 2: Add version to cache interface and getTerrainMatrix**

Update the cache write in `getTerrainMatrix` to store version:

```ts
ns.pathing.terrain[roomName] = {
  matrix: matrix.serialize(),
  tick: Game.time,
  version: TERRAIN_VERSION,
};
```

Update the cache read to check version:

```ts
if (cached && cached.version === TERRAIN_VERSION) {
  return PathFinder.CostMatrix.deserialize(cached.matrix);
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No new errors, `main.js` regenerated.

- [ ] **Step 4: Commit**

```bash
git add src/lib/TerrainMatrix.ts main.js
git commit -m "fix: recalibrate terrain costs plain=2 swamp=10, add cache version stamp"
```

---

### Task 2: Harvester source load-balancing + waiting

**Files:**
- Modify: `src/roles/Harvester.ts`

- [ ] **Step 1: Replace findSource with load-balanced version**

Replace the existing `findSource` function:

```ts
function findSource(creep: Creep): Source | null {
  const sources = creep.room.find(FIND_SOURCES);
  const active = sources.filter(s => s.energy > 0);
  if (active.length === 0) return sources[0] || null;

  const harvesters = creep.room.find(FIND_MY_CREEPS, {
    filter: (c: Creep) => c.memory.role === 'harvester'
  });

  let best: Source | null = null;
  let bestScore = Infinity;

  for (const source of active) {
    const dist = creep.pos.getRangeTo(source);
    const harvesterCount = harvesters.filter((h: Creep) =>
      h.memory.targetSourceId === source.id
    ).length;
    const score = dist * 10 + harvesterCount;
    if (score < bestScore) {
      bestScore = score;
      best = source;
    }
  }

  return best;
}
```

- [ ] **Step 2: Store chosen source in creep memory**

In `harvestAndTransfer`, before moving to source:

```ts
function harvestAndTransfer(creep: Creep): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const source = findSource(creep);
    if (!source) return;

    creep.memory.targetSourceId = source.id;

    const totalAdj = [...getAdjacentWalkable(getTerrainMatrix(creep.room.name), source.pos)].length;
    const busyAdj = source.pos.findInRange(FIND_MY_CREEPS, 1)
      .filter((c: Creep) => c.pos.getRangeTo(source) === 1).length;

    if (busyAdj >= totalAdj && totalAdj > 0 && creep.pos.getRangeTo(source) <= 1) {
      const waitPos = creep.pos.findClosestByPath(
        source.pos.findInRange(FIND_STRUCTURES, 3)
          .filter((s: Structure) => s.structureType !== STRUCTURE_WALL)
      );
      if (waitPos) {
        moveTo(creep, waitPos);
        return;
      }
    }

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      moveTo(creep, source);
    }
  } else {
    const dropOff = findDropOff(creep);
    if (dropOff) {
      if (creep.transfer(dropOff, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, dropOff);
      }
    }
  }
}
```

- [ ] **Step 3: Add imports needed**

Add at top of file:

```ts
import { getTerrainMatrix } from '../lib/TerrainMatrix';
```

- [ ] **Step 4: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No new errors, `main.js` regenerated.

- [ ] **Step 5: Commit**

```bash
git add src/roles/Harvester.ts main.js
git commit -m "feat: load-balanced harvester source selection with wait logic"
```

---

### Task 3: Persistent cost cache, traffic heatmap, give-way

**Files:**
- Modify: `src/lib/Pathing.ts`

- [ ] **Step 1: Add structSig computation and persistent cache**

Add after `isCreepStuck`:

```ts
const TRAFFIC_THRESHOLD = 100;

function computeStructSig(room: Room): number {
  let sig = 0;
  const structures = room.find(FIND_STRUCTURES);
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    sig ^= s.structureType.charCodeAt(0) * (s.pos.x + 1) * (s.pos.y + 3);
  }
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    sig ^= s.structureType.charCodeAt(0) * (s.pos.x + 1) * (s.pos.y + 3) * 7;
  }
  return sig;
}

function getOrBuildCostMatrix(room: Room): CostMatrix {
  const cacheKey = 'pathCache_' + room.name;
  const ns = Memory[CURRENT_NS];
  if (!ns.pathing) ns.pathing = {};
  if (!ns.pathing.costCache) ns.pathing.costCache = {};

  const currentSig = computeStructSig(room);
  const cached = ns.pathing.costCache[room.name] as { matrix: number[]; structSig: number } | undefined;

  if (cached && cached.structSig === currentSig) {
    return PathFinder.CostMatrix.deserialize(cached.matrix);
  }

  const base = getTerrainMatrix(room.name);
  const costs = new PathFinder.CostMatrix();

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      costs.set(x, y, base.get(x, y));
    }
  }

  const structures = room.find(FIND_STRUCTURES);
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    if (s.structureType === STRUCTURE_ROAD) {
      costs.set(s.pos.x, s.pos.y, 1);
    } else if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART) {
      costs.set(s.pos.x, s.pos.y, 255);
    }
  }

  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_RAMPART) {
      costs.set(site.pos.x, site.pos.y, 255);
    }
  }

  ns.pathing.costCache[room.name] = {
    matrix: costs.serialize(),
    structSig: currentSig,
  };

  return costs;
}
```

- [ ] **Step 2: Add traffic heatmap recording**

Add function:

```ts
function recordTraffic(creep: Creep): void {
  const roomName = creep.room.name;
  const ns = Memory[CURRENT_NS];
  if (!ns.pathing.traffic) ns.pathing.traffic = {};
  if (!ns.pathing.traffic[roomName]) ns.pathing.traffic[roomName] = {};

  const pos = creep.pos;
  const key = pos.x + ',' + pos.y;
  const heatmap = ns.pathing.traffic[roomName];
  heatmap[key] = (heatmap[key] || 0) + 1;

  if (heatmap[key] >= TRAFFIC_THRESHOLD) {
    creep.room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
    heatmap[key] = 0;
  }
}
```

- [ ] **Step 3: Add give-way check when stuck**

Add function:

```ts
function giveWayIfStuck(creep: Creep): boolean {
  if (!creep.memory._stuckTicks || creep.memory._stuckTicks < 3) return false;
  if (creep.store.getUsedCapacity() === 0) return false;

  const dirs = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
  ];

  for (const d of dirs) {
    const x = creep.pos.x + d.dx;
    const y = creep.pos.y + d.dy;
    if (x < 0 || x > 49 || y < 0 || y > 49) continue;
    const look = creep.room.lookForAt(LOOK_CREEPS, x, y);
    if (look.length > 0) continue;
    const terrain = creep.room.lookForAt(LOOK_TERRAIN, x, y);
    if (terrain[0] === 'wall') continue;
    creep.move(creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name)));
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Replace moveTo with persistent cache + traffic + give-way**

Replace the entire `moveTo` function:

```ts
export function moveTo(creep: Creep, target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): void {
  const stuck = isCreepStuck(creep);

  if (giveWayIfStuck(creep)) return;

  creep.moveTo(target, {
    visualizePathStyle: { stroke: '#ffffff' },
    reusePath: stuck ? 0 : 10,
    maxOps: stuck ? 2000 : 1200,
    ignoreCreeps: false,
    ...opts,
    costCallback: (roomName: string, matrix: CostMatrix) => {
      if (roomName !== creep.room.name) return matrix;

      const cm = getOrBuildCostMatrix(creep.room);

      const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
      for (let i = 0; i < hostiles.length; i++) {
        const h = hostiles[i];
        cm.set(h.pos.x, h.pos.y, 255);
      }

      const friendlies = creep.room.find(FIND_MY_CREEPS);
      for (let i = 0; i < friendlies.length; i++) {
        const f = friendlies[i];
        if (cm.get(f.pos.x, f.pos.y) !== 255) {
          cm.set(f.pos.x, f.pos.y, 8);
        }
      }

      return cm;
    },
  });

  recordTraffic(creep);
}
```

- [ ] **Step 5: Update import to include CURRENT_NS**

Replace import line:

```ts
import { getTerrainMatrix } from './TerrainMatrix';
import { CURRENT_NS } from './Memory';
```

- [ ] **Step 6: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No new errors, `main.js` regenerated.

- [ ] **Step 7: Commit**

```bash
git add src/lib/Pathing.ts main.js
git commit -m "feat: persistent cost cache, traffic heatmap, give-way logic"
```

---

### Task 4: Delete dead code

**Files:**
- Delete: 31 `.ts` files under `src/`, 28 `.js` files at root, `dist/main.js`

- [ ] **Step 1: Delete all dead `.ts` files**

```bash
rm src/role.harvester.ts src/role.hauler.ts src/role.builder.ts src/role.upgrader.ts
rm src/role.attacker.ts src/role.healer.ts src/role.defender.ts
rm src/role.ranged_escort.ts src/role.claimer.ts src/role.scout.ts
rm src/utils.pathing.ts src/utils.metrics.ts src/utils.stats.ts src/utils.squad.ts
rm src/economy.factory.ts src/economy.market.ts src/economy.labs.ts src/economy.links.ts
rm src/power.logic.ts src/power.operator.ts
rm src/strategy.map.ts src/war.room.ts src/colony.manager.ts
rm src/auto.spawn.ts src/auto.construct_site.ts
rm src/debug.report.ts src/debug.performance.ts
rm src/globals.ts
```

- [ ] **Step 2: Delete all dead `.js` files at root**

```bash
rm role.harvester.js role.hauler.js role.builder.js role.upgrader.js
rm role.attacker.js role.healer.js role.defender.js
rm role.ranged_escort.js role.claimer.js role.scout.js
rm utils.pathing.js utils.metrics.js utils.stats.js utils.squad.js
rm economy.factory.js economy.market.js economy.labs.js economy.links.js
rm power.logic.js power.operator.js
rm strategy.map.js war.room.js colony.manager.js
rm auto.spawn.js auto.construct_site.js
rm debug.report.js debug.performance.js
rm dist/main.js
```

- [ ] **Step 3: Remove unnecessary tsconfig includes**

Read `tsconfig.json` and check if it references deleted files. If so, update.

- [ ] **Step 4: Verify compilation still works**

Run: `npx rollup -c rollup.config.mjs`
Expected: No new errors, `main.js` regenerated.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete dead code from v1 codebase"
```