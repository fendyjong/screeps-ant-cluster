# Legacy Memory Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version-namespace all bot Memory under `Memory.v1` and delete legacy keys every 100 ticks.

**Architecture:** Add `CURRENT_NS` constant and `cleanLegacyMemory()` to `src/lib/Memory.ts`. Move `Memory.pathing` → `Memory.v1.pathing` in `src/lib/TerrainMatrix.ts`. Wire migration + cleanup into `src/main.ts` loop. Non-engine top-level keys not matching current version get pruned.

**Tech Stack:** TypeScript, Screeps globals (`Memory`, `Game`)

---

### Task 1: Add version namespace and cleanup to `src/lib/Memory.ts`

**Files:**
- Modify: `src/lib/Memory.ts`

- [ ] **Step 1: Add CURRENT_NS, ENGINE_KEYS, ensureMemoryNs(), and cleanLegacyMemory() exports**

Replace entire file content:

```ts
import { Goal } from '../types';

export const CURRENT_NS = 'v1';

const ENGINE_KEYS: Record<string, true> = {
  creeps: true,
  rooms: true,
};

export function ensureRoomMemory(room: Room): void {
  if (!room.memory.goal) {
    room.memory.goal = Goal.ECONOMY;
  }
}

export function ensureCreepMemory(creep: Creep): void {
  if (!creep.memory.role) {
    creep.memory.role = 'harvester';
  }
  if (!creep.memory.roomName) {
    creep.memory.roomName = creep.room.name;
  }
}

export function ensureMemoryNs(): void {
  if (!Memory[CURRENT_NS]) {
    Memory[CURRENT_NS] = {};
  }
}

export function cleanLegacyMemory(): void {
  for (const key in Memory) {
    if (key === CURRENT_NS) continue;
    if (ENGINE_KEYS[key]) continue;
    delete Memory[key];
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx rollup -c rollup.config.mjs`
Expected: No errors, `main.js` regenerated.

---

### Task 2: Move `Memory.pathing` to `Memory.v1.pathing`

**Files:**
- Modify: `src/lib/TerrainMatrix.ts`

- [ ] **Step 1: Import `ensureMemoryNs` and `CURRENT_NS`, update `ensurePathingMemory()`**

Add import at top:

```ts
import { ensureMemoryNs, CURRENT_NS } from './Memory';
```

Replace `ensurePathingMemory()`:

```ts
function ensurePathingMemory(): void {
  ensureMemoryNs();
  const ns = Memory[CURRENT_NS];
  if (!ns.pathing) {
    ns.pathing = {};
  }
  if (!ns.pathing.terrain) {
    ns.pathing.terrain = {};
  }
}
```

Replace all three `Memory.pathing.` references in `getTerrainMatrix()`:

```ts
export function getTerrainMatrix(roomName: string): CostMatrix {
  ensurePathingMemory();

  const ns = Memory[CURRENT_NS];
  const cached = ns.pathing.terrain[roomName];
  if (cached) {
    return PathFinder.CostMatrix.deserialize(cached.matrix);
  }

  const matrix = generateTerrainMatrix(roomName);
  ns.pathing.terrain[roomName] = {
    matrix: matrix.serialize(),
    tick: Game.time,
  };

  return matrix;
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No errors, `main.js` regenerated.

---

### Task 3: Wire cleanup into main loop

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Import `ensureMemoryNs` and `cleanLegacyMemory`**

Change line 9:

```ts
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory } from './lib/Memory';
```

- [ ] **Step 2: Add migration check and cleanup calls in the loop**

Replace the `loop` function:

```ts
export const loop = (): void => {
  // Migration: carry v1 → v2 (or whatever next version) when CURRENT_NS changes
  if (Memory.v1 && !Memory[CURRENT_NS]) {
    Memory[CURRENT_NS] = Memory.v1;
    delete Memory.v1;
  }

  // Ensure current version namespace exists
  ensureMemoryNs();

  // Clean up dead creep memory
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }

  // Prune legacy top-level Memory keys every 100 ticks
  if (Game.time % 100 === 0) {
    cleanLegacyMemory();
  }

  // Process each owned room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    ensureRoomMemory(room);
    colonyTick(room);

    // Terrain and layout planning — cache every 100 ticks
    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const layout = planLayout(room);
      const swapPlan = planSwap(room, layout);
      room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
    }

    // Create construction sites from swap plan
    createConstructionSites(room);

    // Periodic layout rechecking
    recheckLayout(room);

    spawnerTick(room, room.memory.goal);
    runCreeps(room, room.memory.goal);
  }
};
```

- [ ] **Step 3: Verify compilation**

Run: `npx rollup -c rollup.config.mjs`
Expected: No errors, `main.js` regenerated.

- [ ] **Step 4: Commit**

```bash
git add src/lib/Memory.ts src/lib/TerrainMatrix.ts src/main.ts main.js
git commit -m "feat: version-namespace Memory under v1, clean legacy every 100 ticks"
```