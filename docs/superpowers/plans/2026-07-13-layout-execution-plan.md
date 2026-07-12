# Layout Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the swap plan by having Builder creeps destroy misplaced structures and build new ones at planned positions, with safety checks and build priorities.

**Architecture:** Architect (code) computes layout and swap plan. Main loop creates construction sites. Builder creeps execute demolition and construction.

**Tech Stack:** TypeScript, Screeps API

---

### Task 1: Rename LayoutPlanner to Architect

**Files:**
- Rename: `src/colony/LayoutPlanner.ts` → `src/colony/Architect.ts`
- Modify: `src/types/index.ts` (update import)
- Modify: `src/main.ts` (update import)

- [ ] **Step 1: Rename the file**

```bash
cd /home/jin/.config/Screeps/scripts/screeps.com/default
git mv src/colony/LayoutPlanner.ts src/colony/Architect.ts
```

- [ ] **Step 2: Update import in types/index.ts**

Change line 3 from:
```ts
import { BunkerLayout, SwapPlan } from '../colony/LayoutPlanner';
```
to:
```ts
import { BunkerLayout, SwapPlan } from '../colony/Architect';
```

- [ ] **Step 3: Update import in main.ts**

Change line 11 from:
```ts
import { planLayout, planSwap } from './colony/LayoutPlanner';
```
to:
```ts
import { planLayout, planSwap } from './colony/Architect';
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename LayoutPlanner to Architect"
```

---

### Task 2: Add Safety Checks to Architect

**Files:**
- Modify: `src/colony/Architect.ts`

- [ ] **Step 1: Add safety check helper functions**

Add after the existing imports (line 1):

```ts
const REBUILD_COSTS: Record<StructureConstant, number> = {
  [STRUCTURE_SPAWN]: 15000,
  [STRUCTURE_STORAGE]: 100000,
  [STRUCTURE_TOWER]: 5000,
  [STRUCTURE_LINK]: 5000,
  [STRUCTURE_TERMINAL]: 100000,
  [STRUCTURE_LAB]: 50000,
  [STRUCTURE_FACTORY]: 100000,
  [STRUCTURE_OBSERVER]: 8000,
  [STRUCTURE_NUKER]: 100000,
  [STRUCTURE_POWER_SPAWN]: 200000,
  [STRUCTURE_EXTRACTOR]: 5000,
  [STRUCTURE_ROAD]: 300,
  [STRUCTURE_WALL]: 10000,
  [STRUCTURE_RAMPART]: 10000,
  [STRUCTURE_CONTAINER]: 5000,
  [STRUCTURE_EXTENSION]: 3000,
};

function isSafeToDestroy(room: Room, structure: Structure): boolean {
  const type = structure.structureType;
  const cost = REBUILD_COSTS[type] || 0;

  // Don't destroy spawn unless we have energy to rebuild or another spawn exists
  if (type === STRUCTURE_SPAWN) {
    const otherSpawns = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_SPAWN && s.id !== structure.id
    });
    if (otherSpawns.length > 0) return true;
    return room.energyCapacityAvailable >= cost;
  }

  // Don't destroy terminal/storage before RCL 4
  if (type === STRUCTURE_TERMINAL || type === STRUCTURE_STORAGE) {
    if (room.controller && room.controller.level < 4) return false;
  }

  // Don't destroy terminal until storage exists
  if (type === STRUCTURE_TERMINAL) {
    const storage = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_STORAGE
    })[0];
    if (!storage) return false;
  }

  // Don't destroy storage until terminal has no non-energy resources
  if (type === STRUCTURE_STORAGE) {
    const terminal = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_TERMINAL
    })[0] as StructureTerminal | undefined;
    if (terminal) {
      const nonEnergy = Object.keys(terminal.store).filter(r => r !== RESOURCE_ENERGY);
      if (nonEnergy.some(r => (terminal.store[r] || 0) > 1000)) return false;
    }
  }

  return true;
}
```

- [ ] **Step 2: Update planSwap to use safety checks**

Replace the `planSwap` function (lines 111-159) with:

```ts
export function planSwap(room: Room, layout: BunkerLayout): SwapPlan {
  const destroy: string[] = [];
  const build: { pos: RoomPosition; structureType: StructureConstant }[] = [];
  
  // Check spawn
  const existingSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  })[0];
  
  if (existingSpawn && !existingSpawn.pos.isEqualTo(layout.spawn)) {
    if (isSafeToDestroy(room, existingSpawn)) {
      destroy.push(existingSpawn.id);
      build.push({ pos: layout.spawn, structureType: STRUCTURE_SPAWN });
    }
  }
  
  // Check storage
  const existingStorage = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_STORAGE
  })[0];
  
  if (existingStorage && !existingStorage.pos.isEqualTo(layout.storage)) {
    if (isSafeToDestroy(room, existingStorage)) {
      destroy.push(existingStorage.id);
      build.push({ pos: layout.storage, structureType: STRUCTURE_STORAGE });
    }
  }
  
  // Check towers
  const existingTowers = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER
  });
  
  for (const tower of existingTowers) {
    const inLayout = layout.towers.some(t => t.isEqualTo(tower.pos));
    if (!inLayout && isSafeToDestroy(room, tower)) {
      destroy.push(tower.id);
    }
  }
  
  for (const towerPos of layout.towers) {
    const exists = existingTowers.some(t => t.pos.isEqualTo(towerPos));
    if (!exists) {
      build.push({ pos: towerPos, structureType: STRUCTURE_TOWER });
    }
  }
  
  return {
    destroy,
    build,
    state: 'idle',
  };
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/colony/Architect.ts
git commit -m "feat: add safety checks to planSwap"
```

---

### Task 3: Add Build Priorities to Architect

**Files:**
- Modify: `src/colony/Architect.ts`

- [ ] **Step 1: Add BUILD_PRIORITIES constant**

Add after the `isSafeToDestroy` function:

```ts
export const BUILD_PRIORITIES: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_LINK,
  STRUCTURE_TERMINAL,
  STRUCTURE_LAB,
  STRUCTURE_FACTORY,
  STRUCTURE_OBSERVER,
  STRUCTURE_NUKER,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_ROAD,
  STRUCTURE_WALL,
  STRUCTURE_RAMPART,
  STRUCTURE_CONTAINER,
  STRUCTURE_EXTENSION,
];

export function sortByPriority(buildList: { pos: RoomPosition; structureType: StructureConstant }[]): { pos: RoomPosition; structureType: StructureConstant }[] {
  return buildList.sort((a, b) => {
    const aIdx = BUILD_PRIORITIES.indexOf(a.structureType);
    const bIdx = BUILD_PRIORITIES.indexOf(b.structureType);
    return aIdx - bIdx;
  });
}
```

- [ ] **Step 2: Update planSwap to sort build list**

Add after line `build.push({ pos: towerPos, structureType: STRUCTURE_TOWER });` and before `return`:

```ts
  // Sort build list by priority
  const sortedBuild = sortByPriority(build);
  
  return {
    destroy,
    build: sortedBuild,
    state: 'idle',
  };
```

Remove the old return statement.

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/colony/Architect.ts
git commit -m "feat: add build priorities to Architect"
```

---

### Task 4: Add Swap Plan Execution to Builder

**Files:**
- Modify: `src/roles/Builder.ts`

- [ ] **Step 1: Add imports and constants**

Replace entire file with:

```ts
// src/roles/Builder.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';
import { BUILD_PRIORITIES } from '../colony/Architect';

const MAX_DEMOLISH_PER_TICK = 3;

function findConstructionSite(creep: Creep): ConstructionSite | null {
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  if (sites.length === 0) return null;
  
  return creep.pos.findClosestByPath(sites);
}

function findDamagedStructure(creep: Creep): Structure | null {
  const structures = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
  });
  
  if (structures.length === 0) return null;
  
  return creep.pos.findClosestByPath(structures);
}

function buildStructures(creep: Creep): void {
  const site = findConstructionSite(creep);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) {
      moveTo(creep, site);
    }
  }
}

function repairStructures(creep: Creep): void {
  const structure = findDamagedStructure(creep);
  if (structure) {
    if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
      moveTo(creep, structure);
    }
  }
}

function dismantleStructure(creep: Creep, structureId: string): boolean {
  const structure = Game.getObjectById(structureId) as Structure | null;
  if (!structure) return false;
  
  const result = creep.dismantle(structure);
  if (result === ERR_NOT_IN_RANGE) {
    moveTo(creep, structure);
  }
  return result === OK;
}

function buildFromSwapPlan(creep: Creep): boolean {
  const layout = creep.room.memory.layout;
  if (!layout || !layout.swap || layout.swap.build.length === 0) return false;
  
  // Find first construction site that matches build list
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  for (const entry of layout.swap.build) {
    const site = sites.find(s => 
      s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
    );
    if (site) {
      if (creep.build(site) === ERR_NOT_IN_RANGE) {
        moveTo(creep, site);
      }
      return true;
    }
  }
  
  return false;
}

export function run(creep: Creep, goal: Goal): void {
  // Get swap plan
  const layout = creep.room.memory.layout;
  const swapPlan = layout?.swap;
  
  // Phase 1: Demolish misplaced structures
  if (swapPlan && swapPlan.destroy.length > 0) {
    swapPlan.state = 'destroying';
    
    // Limit demolitions per tick
    let demolishCount = 0;
    const toRemove: number[] = [];
    
    for (let i = 0; i < swapPlan.destroy.length && demolishCount < MAX_DEMOLISH_PER_TICK; i++) {
      const structureId = swapPlan.destroy[i];
      const structure = Game.getObjectById(structureId) as Structure | null;
      
      if (!structure) {
        // Structure already destroyed, remove from list
        toRemove.push(i);
        continue;
      }
      
      const success = dismantleStructure(creep, structureId);
      if (success) {
        toRemove.push(i);
        demolishCount++;
      }
    }
    
    // Remove demolished structures from list (reverse order to maintain indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      swapPlan.destroy.splice(toRemove[i], 1);
    }
    
    return;
  }
  
  // Phase 2: Build new structures
  if (swapPlan && swapPlan.build.length > 0) {
    swapPlan.state = 'building';
    
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      const built = buildFromSwapPlan(creep);
      if (!built) {
        // No matching construction site, fall back to regular building
        buildStructures(creep);
      }
    } else {
      // Find energy
      const sources = creep.room.find(FIND_SOURCES);
      if (sources.length > 0) {
        const source = sources[0];
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
          moveTo(creep, source);
        }
      }
    }
    
    return;
  }
  
  // Phase 3: Idle - fall back to regular behavior
  if (swapPlan) {
    swapPlan.state = 'idle';
  }
  
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    switch (goal) {
      case Goal.ECONOMY:
        buildStructures(creep);
        break;
      case Goal.DEFEND:
        repairStructures(creep);
        break;
      case Goal.RECOVER:
        repairStructures(creep);
        break;
    }
  } else {
    // Find energy
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
      const source = sources[0];
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        moveTo(creep, source);
      }
    }
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/roles/Builder.ts
git commit -m "feat: add swap plan execution to Builder"
```

---

### Task 5: Add Construction Site Creation to Main Loop

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add construction site creation function**

Add after the `runCreeps` function (line 36):

```ts
const STRUCTURE_COSTS: Record<string, number> = {
  [STRUCTURE_SPAWN]: 15000,
  [STRUCTURE_STORAGE]: 100000,
  [STRUCTURE_TOWER]: 5000,
  [STRUCTURE_LINK]: 5000,
  [STRUCTURE_TERMINAL]: 100000,
  [STRUCTURE_LAB]: 50000,
  [STRUCTURE_FACTORY]: 100000,
  [STRUCTURE_OBSERVER]: 8000,
  [STRUCTURE_NUKER]: 100000,
  [STRUCTURE_POWER_SPAWN]: 200000,
  [STRUCTURE_EXTRACTOR]: 5000,
  [STRUCTURE_ROAD]: 300,
  [STRUCTURE_WALL]: 10000,
  [STRUCTURE_RAMPART]: 10000,
  [STRUCTURE_CONTAINER]: 5000,
  [STRUCTURE_EXTENSION]: 3000,
};

function createConstructionSites(room: Room): void {
  const layout = room.memory.layout;
  if (!layout || !layout.swap || layout.swap.build.length === 0) return;
  
  // Only create sites every 100 ticks
  if (Game.time % 100 !== 0) return;
  
  // Check energy availability
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  
  for (const entry of layout.swap.build) {
    // Skip if construction site already exists at this position
    const existingSite = sites.find(s => 
      s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
    );
    if (existingSite) continue;
    
    // Skip if structure already exists at this position
    const existingStructure = room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y)
      .find(s => s.structureType === entry.structureType);
    if (existingStructure) continue;
    
    // Check energy availability (50% of structure cost)
    const cost = STRUCTURE_COSTS[entry.structureType] || 0;
    if (cost > 0 && room.energyAvailable < cost * 0.5) continue;
    
    // Create construction site
    const result = room.createConstructionSite(entry.pos, entry.structureType);
    if (result === OK) break; // Only create one site per tick
  }
}
```

- [ ] **Step 2: Call createConstructionSites in main loop**

Add after line 60 (after the layout planning block):

```ts
    // Create construction sites from swap plan
    createConstructionSites(room);
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add construction site creation to main loop"
```

---

### Task 6: Add Periodic Rechecking

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add recheck function**

Add after the `createConstructionSites` function:

```ts
function recheckLayout(room: Room): void {
  // Only recheck every 200 ticks
  if (Game.time % 200 !== 0) return;
  
  const layout = room.memory.layout;
  if (!layout || !layout.bunker) return;
  
  // Verify all planned positions are still valid
  let needsReplan = false;
  
  // Check if planned structures still exist at correct positions
  for (const towerPos of layout.bunker.towers) {
    const tower = room.lookForAt(LOOK_STRUCTURES, towerPos.x, towerPos.y)
      .find(s => s.structureType === STRUCTURE_TOWER);
    if (!tower) {
      needsReplan = true;
      break;
    }
  }
  
  // Check if structures moved or were destroyed
  const existingSpawns = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  });
  
  if (existingSpawns.length > 0) {
    const spawn = existingSpawns[0];
    if (!spawn.pos.isEqualTo(layout.bunker.spawn)) {
      needsReplan = true;
    }
  }
  
  // Re-plan if needed
  if (needsReplan) {
    const newLayout = planLayout(room);
    const newSwapPlan = planSwap(room, newLayout);
    room.memory.layout = { bunker: newLayout, swap: newSwapPlan, lastUpdated: Game.time };
  }
}
```

- [ ] **Step 2: Call recheckLayout in main loop**

Add after the `createConstructionSites(room);` line:

```ts
    // Periodic layout rechecking
    recheckLayout(room);
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add periodic layout rechecking"
```

---

### Task 7: Build and Deploy

**Files:**
- Modify: `main.js` (via build)

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 2: Verify main.js updated**

```bash
ls -la main.js
```

Expected: main.js timestamp should be current

- [ ] **Step 3: Commit build output**

```bash
git add main.js
git commit -m "feat: deploy layout execution system"
```

- [ ] **Step 4: Final verification**

Verify the following in main.js:
- `isSafeToDestroy` function exists
- `BUILD_PRIORITIES` constant exists
- `dismantleStructure` function exists
- `createConstructionSites` function exists
- `recheckLayout` function exists
