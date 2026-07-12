# Terrain Analysis + Dynamic Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add terrain matrix caching and bunker layout planning to the Screeps bot.

**Architecture:** Terrain matrices cache permanently in Memory. Layout planner analyzes terrain to find optimal positions for spawn, towers, storage, ramparts, and walls. Swap planner identifies structures to rebuild.

**Tech Stack:** TypeScript, Screeps API

---

## File Structure

```
src/
  lib/
    TerrainMatrix.ts        ← terrain cache + analysis functions
  colony/
    LayoutPlanner.ts        ← bunker layout + swap planning
  main.ts                   ← integrate terrain + layout into tick loop
```

---

### Task 1: Terrain Matrix Cache

**Files:**
- Create: `src/lib/TerrainMatrix.ts`

- [ ] **Step 1: Create TerrainMatrix module**

```ts
// src/lib/TerrainMatrix.ts

import { CostMatrix } from 'screeps';

const TERRAIN_COSTS = {
  plain: 1,
  swamp: 5,
  wall: 255,
};

function ensurePathingMemory(): void {
  if (!Memory.pathing) {
    Memory.pathing = {};
  }
  if (!Memory.pathing.terrain) {
    Memory.pathing.terrain = {};
  }
}

function generateTerrainMatrix(roomName: string): CostMatrix {
  const matrix = new PathFinder.CostMatrix();
  const terrain = Game.map.getRoomTerrain(roomName);
  
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const terrainType = terrain.get(x, y);
      
      if (terrainType === TERRAIN_MASK_WALL) {
        matrix.set(x, y, TERRAIN_COSTS.wall);
      } else if (terrainType === TERRAIN_MASK_SWAMP) {
        matrix.set(x, y, TERRAIN_COSTS.swamp);
      } else {
        matrix.set(x, y, TERRAIN_COSTS.plain);
      }
    }
  }
  
  return matrix;
}

export function getTerrainMatrix(roomName: string): CostMatrix {
  ensurePathingMemory();
  
  const cached = Memory.pathing.terrain[roomName];
  if (cached) {
    return PathFinder.CostMatrix.deserialize(cached.matrix);
  }
  
  const matrix = generateTerrainMatrix(roomName);
  Memory.pathing.terrain[roomName] = {
    matrix: matrix.serialize(),
    tick: Game.time,
  };
  
  return matrix;
}

export function isWalkable(terrainMatrix: CostMatrix, x: number, y: number): boolean {
  if (x < 0 || x > 49 || y < 0 || y > 49) return false;
  return terrainMatrix.get(x, y) < 255;
}

export function findWalkablePositions(roomName: string): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const positions: RoomPosition[] = [];
  
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (isWalkable(matrix, x, y)) {
        positions.push(new RoomPosition(x, y, roomName));
      }
    }
  }
  
  return positions;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/TerrainMatrix.ts
git commit -m "feat: add terrain matrix cache with analysis functions"
```

---

### Task 2: Terrain Analysis Functions

**Files:**
- Modify: `src/lib/TerrainMatrix.ts`

- [ ] **Step 1: Add terrain analysis functions**

```ts
// Add to src/lib/TerrainMatrix.ts

export function findChokepoints(roomName: string): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const chokepoints: RoomPosition[] = [];
  
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      if (!isWalkable(matrix, x, y)) continue;
      
      // Check if this is a narrow passage
      const neighbors = [
        isWalkable(matrix, x - 1, y),
        isWalkable(matrix, x + 1, y),
        isWalkable(matrix, x, y - 1),
        isWalkable(matrix, x, y + 1),
      ];
      
      const walkableCount = neighbors.filter(Boolean).length;
      
      // Chokepoint: 2 or fewer walkable neighbors
      if (walkableCount <= 2) {
        chokepoints.push(new RoomPosition(x, y, roomName));
      }
    }
  }
  
  return chokepoints;
}

export function findPerimeterPositions(roomName: string): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const perimeter: RoomPosition[] = [];
  
  // Check edges of room
  for (let i = 0; i < 50; i++) {
    // Top and bottom edges
    if (isWalkable(matrix, i, 1)) perimeter.push(new RoomPosition(i, 1, roomName));
    if (isWalkable(matrix, i, 48)) perimeter.push(new RoomPosition(i, 48, roomName));
    
    // Left and right edges
    if (isWalkable(matrix, 1, i)) perimeter.push(new RoomPosition(1, i, roomName));
    if (isWalkable(matrix, 48, i)) perimeter.push(new RoomPosition(48, i, roomName));
  }
  
  return perimeter;
}

export function calculateCoverage(pos: RoomPosition, range: number, roomName: string): number {
  let count = 0;
  
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      
      if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (distance <= range) {
          count++;
        }
      }
    }
  }
  
  return count;
}

export function findOptimalTowerPositions(roomName: string, count: number): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const positions: RoomPosition[] = [];
  
  // Find positions that maximize coverage of spawn area
  const candidates: { pos: RoomPosition; score: number }[] = [];
  
  for (let y = 5; y < 45; y++) {
    for (let x = 5; x < 45; x++) {
      if (!isWalkable(matrix, x, y)) continue;
      
      const pos = new RoomPosition(x, y, roomName);
      const coverage = calculateCoverage(pos, 10, roomName);
      
      // Prefer positions away from edges
      const edgeDistance = Math.min(x, y, 49 - x, 49 - y);
      const score = coverage + edgeDistance * 2;
      
      candidates.push({ pos, score });
    }
  }
  
  // Sort by score and take top positions
  candidates.sort((a, b) => b.score - a.score);
  
  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    positions.push(candidates[i].pos);
  }
  
  return positions;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/TerrainMatrix.ts
git commit -m "feat: add terrain analysis functions for chokepoints and coverage"
```

---

### Task 3: Layout Planner Interface

**Files:**
- Create: `src/colony/LayoutPlanner.ts`

- [ ] **Step 1: Create LayoutPlanner module**

```ts
// src/colony/LayoutPlanner.ts

import { getTerrainMatrix, isWalkable, findOptimalTowerPositions } from '../lib/TerrainMatrix';

export interface BunkerLayout {
  spawn: RoomPosition;
  towers: RoomPosition[];
  storage: RoomPosition;
  ramparts: RoomPosition[];
  walls: RoomPosition[];
}

export interface SwapPlan {
  destroy: string[];           // structure IDs to remove
  build: { pos: RoomPosition; structureType: StructureConstant }[];
  state: 'idle' | 'destroying' | 'building';
}

function findSpawnPosition(roomName: string): RoomPosition {
  const matrix = getTerrainMatrix(roomName);
  
  // Find central walkable position
  for (let radius = 0; radius < 20; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = 25 + dx;
        const y = 25 + dy;
        
        if (isWalkable(matrix, x, y)) {
          return new RoomPosition(x, y, roomName);
        }
      }
    }
  }
  
  // Fallback to center
  return new RoomPosition(25, 25, roomName);
}

function findStoragePosition(roomName: string, spawnPos: RoomPosition): RoomPosition {
  const matrix = getTerrainMatrix(roomName);
  
  // Find walkable position near spawn
  for (let radius = 1; radius < 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = spawnPos.x + dx;
        const y = spawnPos.y + dy;
        
        if (isWalkable(matrix, x, y) && !(x === spawnPos.x && y === spawnPos.y)) {
          return new RoomPosition(x, y, roomName);
        }
      }
    }
  }
  
  return new RoomPosition(spawnPos.x + 1, spawnPos.y, roomName);
}

function findRampartPositions(roomName: string, layout: BunkerLayout): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const ramparts: RoomPosition[] = [];
  
  // Find perimeter positions near spawn
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const x = layout.spawn.x + dx;
      const y = layout.spawn.y + dy;
      
      if (isWalkable(matrix, x, y)) {
        // Check if this is a perimeter position
        const neighbors = [
          isWalkable(matrix, x - 1, y),
          isWalkable(matrix, x + 1, y),
          isWalkable(matrix, x, y - 1),
          isWalkable(matrix, x, y + 1),
        ];
        
        const walkableCount = neighbors.filter(Boolean).length;
        if (walkableCount <= 3) {
          ramparts.push(new RoomPosition(x, y, roomName));
        }
      }
    }
  }
  
  return ramparts.slice(0, 10); // Limit to 10 ramparts
}

function findWallPositions(roomName: string, layout: BunkerLayout): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const walls: RoomPosition[] = [];
  
  // Find positions to block enemy paths
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      if (!isWalkable(matrix, x, y)) continue;
      
      // Check if this is a chokepoint
      const neighbors = [
        isWalkable(matrix, x - 1, y),
        isWalkable(matrix, x + 1, y),
        isWalkable(matrix, x, y - 1),
        isWalkable(matrix, x, y + 1),
      ];
      
      const walkableCount = neighbors.filter(Boolean).length;
      if (walkableCount <= 2) {
        walls.push(new RoomPosition(x, y, roomName));
      }
    }
  }
  
  return walls.slice(0, 20); // Limit to 20 walls
}

export function planLayout(room: Room): BunkerLayout {
  const spawnPos = findSpawnPosition(room.name);
  const storagePos = findStoragePosition(room.name, spawnPos);
  const towerPositions = findOptimalTowerPositions(room.name, 3);
  
  const partialLayout: BunkerLayout = {
    spawn: spawnPos,
    towers: towerPositions,
    storage: storagePos,
    ramparts: [],
    walls: [],
  };
  
  partialLayout.ramparts = findRampartPositions(room.name, partialLayout);
  partialLayout.walls = findWallPositions(room.name, partialLayout);
  
  return partialLayout;
}

export function planSwap(room: Room, layout: BunkerLayout): SwapPlan {
  const destroy: string[] = [];
  const build: { pos: RoomPosition; structureType: StructureConstant }[] = [];
  
  // Check spawn
  const existingSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  })[0];
  
  if (existingSpawn && !existingSpawn.pos.isEqualTo(layout.spawn)) {
    destroy.push(existingSpawn.id);
    build.push({ pos: layout.spawn, structureType: STRUCTURE_SPAWN });
  }
  
  // Check storage
  const existingStorage = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_STORAGE
  })[0];
  
  if (existingStorage && !existingStorage.pos.isEqualTo(layout.storage)) {
    destroy.push(existingStorage.id);
    build.push({ pos: layout.storage, structureType: STRUCTURE_STORAGE });
  }
  
  // Check towers
  const existingTowers = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER
  });
  
  for (const tower of existingTowers) {
    const inLayout = layout.towers.some(t => t.isEqualTo(tower.pos));
    if (!inLayout) {
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

- [ ] **Step 2: Commit**

```bash
git add src/colony/LayoutPlanner.ts
git commit -m "feat: add layout planner with bunker and swap planning"
```

---

### Task 4: Integrate with Main Loop

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add terrain and layout imports**

```ts
// Add to src/main.ts imports
import { getTerrainMatrix } from './lib/TerrainMatrix';
import { planLayout, planSwap, BunkerLayout, SwapPlan } from './colony/LayoutPlanner';
```

- [ ] **Step 2: Add layout planning to room processing**

```ts
// Add to the room loop in module.exports.loop
// After ensureRoomMemory(room) and colonyTick(room):

// Terrain and layout planning
getTerrainMatrix(room.name);
const layout = planLayout(room);
const swapPlan = planSwap(room, layout);

// Store in memory
if (!room.memory.layout) {
  room.memory.layout = {};
}
room.memory.layout.bunker = layout;
room.memory.layout.swap = swapPlan;
room.memory.layout.lastUpdated = Game.time;
```

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: integrate terrain and layout planning into main loop"
```

---

### Task 5: Add Memory Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add layout memory types**

```ts
// Add to src/types/index.ts

import { BunkerLayout, SwapPlan } from '../colony/LayoutPlanner';

export interface LayoutMemory {
  bunker?: BunkerLayout;
  swap?: SwapPlan;
  lastUpdated?: number;
}

export interface PathingMemory {
  terrain?: {
    [roomName: string]: {
      matrix: number[];
      tick: number;
    };
  };
}

// Update RoomMemory interface
export interface RoomMemory {
  goal: Goal;
  layout?: LayoutMemory;
}

// Add global Memory interface extension
declare global {
  interface Memory {
    pathing?: PathingMemory;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add memory types for layout and pathing"
```

---

### Task 6: Build and Deploy

**Files:**
- Modify: `main.js` (via build)

- [ ] **Step 1: Build the project**

```bash
npm run build
```

- [ ] **Step 2: Verify main.js updated**

```bash
ls -la main.js
```

Expected: main.js timestamp should be current

- [ ] **Step 3: Commit build output**

```bash
git add main.js
git commit -m "feat: deploy terrain and layout system to main.js"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-13-terrain-layout-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
