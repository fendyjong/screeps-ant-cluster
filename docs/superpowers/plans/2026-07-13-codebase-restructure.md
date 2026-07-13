# Codebase Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure src/ directory — split monoliths, move files to correct dirs, fully type Memory, prune dead code.

**Architecture:** 7 sequential tasks. Each creates/renames/splits files, updates imports in all affected files, then builds. No behavior changes.

**Tech Stack:** TypeScript, Rollup, Screeps types

---

### Task 1: Expand Memory types + remove all `(Memory.v1 as any)` casts

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/main.ts`
- Modify: `src/lib/HUD.ts`
- Modify: `src/lib/PathFinder.ts`
- Modify: `src/lib/Pathing.ts`
- Modify: `src/lib/Memory.ts`
- Modify: `src/hatchery/Hatchery.ts`
- Modify: `src/hatchery/Queen.ts`
- Modify: `src/lib/Cashflow.ts`

- [ ] **Step 1: Expand `types/index.ts` — add runtime fields to Memory, CreepMemory, RoomMemory**

Replace the `declare global` block and `CreepMemory`/`RoomMemory` interfaces:

```ts
// src/types/index.ts

import { BunkerLayout, SwapPlan } from '../colony/Architect';
import { SpawnRequest } from '../hatchery/Request';

export interface TaskMemory {
	type: 'harvest' | 'transfer' | 'withdraw' | 'pickup' | 'build' | 'repair' | 'upgrade' | 'dismantle' | 'recharge'
	targetId: string
}

export interface CreepMemory {
	role: string
	roomName: string
	task?: TaskMemory
	_stuckTicks?: number
	_lastPos?: { x: number; y: number; roomName: string }
	_path?: string
}

export interface LayoutMemory {
	bunker?: BunkerLayout;
	swap?: SwapPlan;
	lastUpdated?: number;
}

export interface RoomMemory {
	layout?: LayoutMemory;
}

export interface TerrainCache {
	matrix: number[];
	tick: number;
	version: number;
}

export interface PathingMemory {
	terrain: Record<string, TerrainCache>;
	structureCache: Record<string, { matrix: number[]; structSig: number }>;
	traffic: Record<string, Record<string, number>>;
	pendingRoads: { roomName: string; x: number; y: number }[];
}

export interface SpawnRequestData {
	role: string
	priority: number
	bodyMin: number[]
	bodyIdeal: number[]
	count: number
	memory: Record<string, unknown>
	createdAt: number
	roomName: string
}

export interface DeathWatchEntry {
	name: string
	ttl: number
}

export interface HatcheryMemory {
	queue: Record<string, SpawnRequestData[]>
	deathWatch: Record<string, Record<string, DeathWatchEntry[]>>
}

export type CashflowHealth = 'red' | 'yellow' | 'green';

export interface CashflowMemory {
	incomeRate: number
	spawnRate: number
	buildRate: number
}

export interface GameEvents {
	hostile?: Record<string, { tick: number; room: string; threat: 'scout' | 'swarm' }>
	expansion?: Record<string, { sourceRoom: string; targetRoom: string; tick: number }>
}

declare global {
	interface Memory {
		v1: {
			hatchery: HatcheryMemory
			cashflow?: Record<string, CashflowMemory>
			events?: GameEvents
			pathing?: PathingMemory
			hud?: {
				cpuTick: Record<string, number>
				lastThreat: Record<string, number>
			}
			_prevTotalEnergy?: Record<string, number>
			_prevProgress?: Record<string, number>
		}
	}
}
```

- [ ] **Step 2: Remove `(Memory.v1 as any)` casts from `src/main.ts`**

Replace these lines:
```ts
const prevTotal = (Memory.v1 as any)._prevTotalEnergy?.[roomName] ?? -1;
```
→
```ts
const prevTotal = Memory.v1._prevTotalEnergy?.[roomName] ?? -1;
```

```ts
if (!(Memory.v1 as any)._prevTotalEnergy) (Memory.v1 as any)._prevTotalEnergy = {};
(Memory.v1 as any)._prevTotalEnergy[roomName] = currentTotal;
```
→
```ts
if (!Memory.v1._prevTotalEnergy) Memory.v1._prevTotalEnergy = {};
Memory.v1._prevTotalEnergy[roomName] = currentTotal;
```

```ts
const prev = (Memory.v1 as any)._prevProgress?.[site.id] || site.progress;
```
→
```ts
const prev = Memory.v1._prevProgress?.[site.id] || site.progress;
```

```ts
if (!(Memory.v1 as any)._prevProgress) (Memory.v1 as any)._prevProgress = {};
(Memory.v1 as any)._prevProgress[site.id] = site.progress;
```
→
```ts
if (!Memory.v1._prevProgress) Memory.v1._prevProgress = {};
Memory.v1._prevProgress[site.id] = site.progress;
```

- [ ] **Step 3: Remove `(Memory.v1 as any)` casts from `src/lib/HUD.ts`**

Replace all `(Memory.v1 as any).hud` → `Memory.v1.hud` and `(Memory.v1 as any).pathing` → `Memory.v1.pathing`.

Specifically:
- Line 51: `(Memory.v1 as any).hud?.cpuTick?.[room.name]` → `Memory.v1.hud?.cpuTick?.[room.name]`
- Line 104: `(Memory.v1 as any).hud?.lastThreat?.[room.name]` → `Memory.v1.hud?.lastThreat?.[room.name]`
- Line 119: `((Memory.v1 as any).pathing?.pendingRoads || [])` → `(Memory.v1.pathing?.pendingRoads || [])`
- Line 176: `if (!(Memory.v1 as any).hud) (Memory.v1 as any).hud = {};` → `if (!Memory.v1.hud) Memory.v1.hud = {};`
- Line 177: `if (!(Memory.v1 as any).hud.cpuTick) (Memory.v1 as any).hud.cpuTick = {};` → `if (!Memory.v1.hud.cpuTick) Memory.v1.hud.cpuTick = {};`
- Line 178: `(Memory.v1 as any).hud.cpuTick[room.name]` → `Memory.v1.hud.cpuTick[room.name]`
- Line 186: `if (!(Memory.v1 as any).hud.lastThreat) (Memory.v1 as any).hud.lastThreat = {};` → `if (!Memory.v1.hud.lastThreat) Memory.v1.hud.lastThreat = {};`
- Line 187: `(Memory.v1 as any).hud.lastThreat[room.name]` → `Memory.v1.hud.lastThreat[room.name]`

- [ ] **Step 4: Remove `(Memory as any)[CURRENT_NS]` from `src/lib/PathFinder.ts`**

Line 23: `if (!ns) { (Memory as any)[CURRENT_NS] = {}; }`
→ `if (!ns) { Memory[CURRENT_NS] = {} as Memory['v1']; }`

- [ ] **Step 5: Remove `(Memory.v1 as any)` from `src/lib/Pathing.ts`**

Line 100: `const ns = Memory.v1 as any;`
→ `const ns = Memory.v1;`

- [ ] **Step 6: Remove `(Memory as any).v1` from `src/lib/Memory.ts`**

Line 26: `Memory[CURRENT_NS] = {};` is already fine (CURRENT_NS is 'v1', Memory type has `v1`).

Ensure `ensureMemoryNs` uses typed access:
```ts
export function ensureMemoryNs(): void {
  if (!Memory.v1) {
    Memory.v1 = {} as Memory['v1'];
  }
}
```

- [ ] **Step 7: Remove `(Memory as any).v1` from `src/hatchery/Hatchery.ts`**

Line 11: `if (!Memory.v1) (Memory as any).v1 = {};`
→ `if (!Memory.v1) Memory.v1 = {} as Memory['v1'];`

- [ ] **Step 8: No changes needed in Queen.ts** — it already uses `Memory.v1` directly (no cast). Verify.

- [ ] **Step 9: No changes needed in Cashflow.ts** — it already uses `Memory.v1.cashflow` directly. Verify.

- [ ] **Step 10: Build and verify**

Run: `npm run build`
Expected: No errors. All the same warnings as before (pre-existing TS strict issues unrelated to this task).

- [ ] **Step 11: Commit**

```bash
git add src/types/index.ts src/main.ts src/lib/HUD.ts src/lib/PathFinder.ts src/lib/Pathing.ts src/lib/Memory.ts src/hatchery/Hatchery.ts
git commit -m "refactor: fully type Memory, remove all (Memory.v1 as any) casts"
```

---

### Task 2: Split Architect.ts into BuildCosts.ts, LayoutPlanner.ts, SwapPlanner.ts

**Files:**
- Create: `src/colony/BuildCosts.ts`
- Create: `src/colony/LayoutPlanner.ts`
- Create: `src/colony/SwapPlanner.ts`
- Delete: `src/colony/Architect.ts`
- Modify: `src/colony/AnchorPlanner.ts` (import path)
- Modify: `src/colony/BarrierPlanner.ts` (import path)
- Modify: `src/colony/Lifecycle.ts` (import path)
- Modify: `src/main.ts` (import path)
- Modify: `src/roles/Builder.ts` (import path)
- Modify: `src/types/index.ts` (import path)

- [ ] **Step 1: Create `src/colony/BuildCosts.ts`**

Contents — constants and pure functions only:
```ts
import { getBudget } from '../lib/Cashflow';

export const REBUILD_COSTS: Partial<Record<StructureConstant, number>> = {
  [STRUCTURE_SPAWN]: 15000,
  [STRUCTURE_STORAGE]: 100000,
  [STRUCTURE_TOWER]: 5000,
  [STRUCTURE_LINK]: 5000,
  [STRUCTURE_TERMINAL]: 100000,
  [STRUCTURE_LAB]: 50000,
  [STRUCTURE_OBSERVER]: 8000,
  [STRUCTURE_NUKER]: 100000,
  [STRUCTURE_POWER_SPAWN]: 200000,
  [STRUCTURE_EXTRACTOR]: 5000,
  [STRUCTURE_ROAD]: 300,
  [STRUCTURE_WALL]: 10000,
  [STRUCTURE_RAMPART]: 10000,
  [STRUCTURE_EXTENSION]: 3000,
};

export const BUILD_PRIORITIES: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_LINK,
  STRUCTURE_TERMINAL,
  STRUCTURE_LAB,
  STRUCTURE_OBSERVER,
  STRUCTURE_NUKER,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_EXTENSION,
  STRUCTURE_ROAD,
  STRUCTURE_RAMPART,
  STRUCTURE_WALL,
];

export function sortByPriority(buildList: { pos: RoomPosition; structureType: StructureConstant }[]): { pos: RoomPosition; structureType: StructureConstant }[] {
  return buildList.sort((a, b) => {
    const aIdx = BUILD_PRIORITIES.indexOf(a.structureType);
    const bIdx = BUILD_PRIORITIES.indexOf(b.structureType);
    return aIdx - bIdx;
  });
}

export function isSafeToDestroy(room: Room, structure: Structure): boolean {
  const type = structure.structureType;
  const cost = REBUILD_COSTS[type] || 0;

  if (type === STRUCTURE_SPAWN) {
    const otherSpawns = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_SPAWN && s.id !== structure.id
    });
    if (otherSpawns.length > 0) return true;
    const { buildBudget } = getBudget(room);
    return buildBudget >= cost;
  }

  if (type === STRUCTURE_TERMINAL || type === STRUCTURE_STORAGE) {
    if (room.controller && room.controller.level < 4) return false;
  }

  if (type === STRUCTURE_TERMINAL) {
    const storage = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_STORAGE
    })[0];
    if (!storage) return false;
  }

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

- [ ] **Step 2: Create `src/colony/LayoutPlanner.ts`**

Contents — BunkerLayout interface, zone carving, planLayout:

```ts
import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';
import { findOptimalTowerPositions } from './TowerPlanner';
import { getBudget } from '../lib/Cashflow';
import { findBestAnchor } from './AnchorPlanner';
import { computeBarriers } from './BarrierPlanner';

export interface BunkerLayout {
  anchor: RoomPosition;
  spawn: RoomPosition;
  storage: RoomPosition;
  terminal: RoomPosition;
  factory: RoomPosition;
  powerSpawn: RoomPosition;
  nuker: RoomPosition;
  observer: RoomPosition;
  labs: RoomPosition[];
  extensions: RoomPosition[];
  towers: RoomPosition[];
  linkSpawn: RoomPosition;
  linkController: RoomPosition;
  linkLab: RoomPosition;
  ramparts: RoomPosition[];
  walls: RoomPosition[];
  roads: RoomPosition[];
}

function getAdjacentWalkable(matrix: CostMatrix, pos: RoomPosition): RoomPosition[] {
  const dirs = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
  ];
  const result: RoomPosition[] = [];
  for (const d of dirs) {
    const x = pos.x + d.dx;
    const y = pos.y + d.dy;
    if (isWalkable(matrix, x, y)) {
      result.push(new RoomPosition(x, y, pos.roomName));
    }
  }
  return result;
}

function carveCoreZone(room: Room, anchor: RoomPosition, matrix: CostMatrix): BunkerLayout {
  const layout = {} as BunkerLayout;
  layout.anchor = anchor;
  layout.spawn = anchor;

  const coreTiles = new Map<string, RoomPosition>();
  coreTiles.set(anchor.x + ',' + anchor.y, anchor);

  const queue = [anchor];
  while (queue.length > 0 && coreTiles.size < 25) {
    const current = queue.shift()!;
    for (const adj of getAdjacentWalkable(matrix, current)) {
      const key = adj.x + ',' + adj.y;
      if (!coreTiles.has(key)) {
        coreTiles.set(key, adj);
        queue.push(adj);
      }
    }
  }

  const sortedTiles = Array.from(coreTiles.values())
    .sort((a, b) => a.getRangeTo(anchor) - b.getRangeTo(anchor));

  const getTile = (i: number) => sortedTiles[i] || anchor;

  layout.storage = getTile(1);
  layout.terminal = getTile(2);
  layout.factory = getTile(3);
  layout.powerSpawn = getTile(4);
  layout.nuker = getTile(5);
  layout.observer = getTile(6);
  layout.linkSpawn = getTile(7);

  layout.labs = [];
  layout.extensions = [];
  layout.towers = [];
  layout.ramparts = [];
  layout.walls = [];
  layout.roads = [];
  layout.linkController = layout.linkSpawn;
  layout.linkLab = layout.linkSpawn;

  return layout;
}

function carveLabZone(room: Room, matrix: CostMatrix, coreKeys: Set<string>): RoomPosition[] {
  const roomName = room.name;
  const labs: RoomPosition[] = [];
  const claimed = new Set(coreKeys);

  const queue: RoomPosition[] = [];
  for (const key of coreKeys) {
    const [x, y] = key.split(',').map(Number);
    queue.push(new RoomPosition(x, y, roomName));
  }

  const candidates: RoomPosition[] = [];
  const visited = new Set<string>();
  while (queue.length > 0 && candidates.length < 30) {
    const current = queue.shift()!;
    for (const adj of getAdjacentWalkable(matrix, current)) {
      const key = adj.x + ',' + adj.y;
      if (claimed.has(key) || visited.has(key)) continue;
      visited.add(key);
      candidates.push(adj);
      queue.push(adj);
    }
  }

  candidates.sort((a, b) => {
    const distA = a.getRangeTo(new RoomPosition(25, 25, roomName));
    const distB = b.getRangeTo(new RoomPosition(25, 25, roomName));
    return distA - distB;
  });

  const labCount = Math.min(15, candidates.length);
  for (let i = 0; i < labCount; i++) {
    labs.push(candidates[i]);
    claimed.add(candidates[i].x + ',' + candidates[i].y);
  }

  return labs;
}

function carveExtensions(
  room: Room, matrix: CostMatrix,
  coreKeys: Set<string>, labKeys: Set<string>
): RoomPosition[] {
  const roomName = room.name;
  const claimed = new Set<string>();
  for (const k of coreKeys) claimed.add(k);
  for (const k of labKeys) claimed.add(k);

  const extensions: RoomPosition[] = [];
  const controllerLevel = room.controller ? room.controller.level : 1;
  const maxExtensions = Math.min(60, CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][controllerLevel] || 0);

  const queue: RoomPosition[] = [];
  for (const key of claimed) {
    const [x, y] = key.split(',').map(Number);
    for (const adj of getAdjacentWalkable(matrix, new RoomPosition(x, y, roomName))) {
      const k = adj.x + ',' + adj.y;
      if (!claimed.has(k)) {
        queue.push(adj);
        claimed.add(k);
      }
    }
  }

  while (queue.length > 0 && extensions.length < maxExtensions) {
    const pos = queue.shift()!;
    extensions.push(pos);
    for (const adj of getAdjacentWalkable(matrix, pos)) {
      const k = adj.x + ',' + adj.y;
      if (!claimed.has(k)) {
        queue.push(adj);
        claimed.add(k);
      }
    }
  }

  return extensions;
}

function placeTowers(room: Room, matrix: CostMatrix, extensions: RoomPosition[]): RoomPosition[] {
  const controllerLevel = room.controller ? room.controller.level : 1;
  const towerCount = Math.min(6, CONTROLLER_STRUCTURES[STRUCTURE_TOWER][controllerLevel] || 0);
  return findOptimalTowerPositions(room.name, towerCount);
}

function computeRoadPositions(
  room: Room, matrix: CostMatrix,
  core: BunkerLayout, extensions: RoomPosition[]
): RoomPosition[] {
  const roomName = room.name;
  const roads = new Map<string, RoomPosition>();
  const claim = new Set<string>();

  claim.add(core.spawn.x + ',' + core.spawn.y);
  claim.add(core.storage.x + ',' + core.storage.y);
  claim.add(core.terminal.x + ',' + core.terminal.y);

  for (const ext of extensions) {
    claim.add(ext.x + ',' + ext.y);
  }

  if (room.controller) {
    const ctrl = room.controller.pos;
    const queue: RoomPosition[] = [ctrl];
    const visited = new Set<string>();
    visited.add(ctrl.x + ',' + ctrl.y);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const key = cur.x + ',' + cur.y;

      if (claim.has(key)) break;

      if (!roads.has(key) && isWalkable(matrix, cur.x, cur.y)) {
        roads.set(key, cur);
      }

      for (const adj of getAdjacentWalkable(matrix, cur)) {
        const k = adj.x + ',' + adj.y;
        if (!visited.has(k)) {
          visited.add(k);
          queue.push(adj);
        }
      }
    }
  }

  return Array.from(roads.values());
}

export function planLayout(room: Room): BunkerLayout {
  const matrix = getTerrainMatrix(room.name);
  const anchor = findBestAnchor(room);

  const core = carveCoreZone(room, anchor, matrix);

  const coreKeys = new Set<string>();
  coreKeys.add(core.spawn.x + ',' + core.spawn.y);
  coreKeys.add(core.storage.x + ',' + core.storage.y);
  coreKeys.add(core.terminal.x + ',' + core.terminal.y);
  coreKeys.add(core.factory.x + ',' + core.factory.y);
  coreKeys.add(core.powerSpawn.x + ',' + core.powerSpawn.y);
  coreKeys.add(core.nuker.x + ',' + core.nuker.y);
  coreKeys.add(core.observer.x + ',' + core.observer.y);
  coreKeys.add(core.linkSpawn.x + ',' + core.linkSpawn.y);

  const labs = carveLabZone(room, matrix, coreKeys);
  core.labs = labs;

  const labKeys = new Set(labs.map(p => p.x + ',' + p.y));

  const extensions = carveExtensions(room, matrix, coreKeys, labKeys);
  core.extensions = extensions;

  core.towers = placeTowers(room, matrix, extensions);

  core.ramparts = computeBarriers(room, core.anchor);
  core.walls = [];

  core.roads = computeRoadPositions(room, matrix, core, extensions);

  if (room.controller) {
    core.linkController = new RoomPosition(room.controller.pos.x + 1, room.controller.pos.y, room.name);
    if (!isWalkable(matrix, core.linkController.x, core.linkController.y)) {
      core.linkController = new RoomPosition(room.controller.pos.x, room.controller.pos.y + 1, room.name);
    }
  }
  core.linkLab = labs.length > 0 ? labs[Math.floor(labs.length / 2)] : core.linkSpawn;

  return core;
}
```

- [ ] **Step 3: Create `src/colony/SwapPlanner.ts`**

Contents — SwapPlan interface, planSwap:

```ts
import { isSafeToDestroy, REBUILD_COSTS, sortByPriority } from './BuildCosts';
import { getBudget } from '../lib/Cashflow';
import { BunkerLayout } from './LayoutPlanner';

export interface SwapPlan {
  destroy: string[];
  build: { pos: RoomPosition; structureType: StructureConstant }[];
  state: 'idle' | 'destroying' | 'building';
}

function isWalkablePos(pos: RoomPosition): boolean {
  return pos !== undefined && pos.x >= 0 && pos.x < 50 && pos.y >= 0 && pos.y < 50;
}

export function planSwap(room: Room, layout: BunkerLayout): SwapPlan {
  const destroy: string[] = [];
  const build: { pos: RoomPosition; structureType: StructureConstant }[] = [];

  const existingSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  })[0];

  if (existingSpawn && !existingSpawn.pos.isEqualTo(layout.spawn)) {
    if (isSafeToDestroy(room, existingSpawn)) {
      destroy.push(existingSpawn.id);
      build.push({ pos: layout.spawn, structureType: STRUCTURE_SPAWN });
    }
  }

  const existingStorage = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_STORAGE
  })[0];

  if (existingStorage && !existingStorage.pos.isEqualTo(layout.storage)) {
    if (isSafeToDestroy(room, existingStorage)) {
      destroy.push(existingStorage.id);
      build.push({ pos: layout.storage, structureType: STRUCTURE_STORAGE });
    }
  }

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

  const existingTerminal = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TERMINAL
  })[0];
  if (existingTerminal && !existingTerminal.pos.isEqualTo(layout.terminal)) {
    if (isSafeToDestroy(room, existingTerminal)) {
      destroy.push(existingTerminal.id);
      build.push({ pos: layout.terminal, structureType: STRUCTURE_TERMINAL });
    }
  }

  const existingFactory = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_FACTORY
  })[0];
  if (existingFactory && !existingFactory.pos.isEqualTo(layout.factory)) {
    if (isSafeToDestroy(room, existingFactory)) {
      destroy.push(existingFactory.id);
      build.push({ pos: layout.factory, structureType: STRUCTURE_FACTORY });
    }
  }

  const existingPowerSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_POWER_SPAWN
  })[0];
  if (existingPowerSpawn && !existingPowerSpawn.pos.isEqualTo(layout.powerSpawn)) {
    if (isSafeToDestroy(room, existingPowerSpawn)) {
      destroy.push(existingPowerSpawn.id);
      build.push({ pos: layout.powerSpawn, structureType: STRUCTURE_POWER_SPAWN });
    }
  }

  const existingNuker = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_NUKER
  })[0];
  if (existingNuker && !existingNuker.pos.isEqualTo(layout.nuker)) {
    if (isSafeToDestroy(room, existingNuker)) {
      destroy.push(existingNuker.id);
      build.push({ pos: layout.nuker, structureType: STRUCTURE_NUKER });
    }
  }

  const existingObserver = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_OBSERVER
  })[0];
  if (existingObserver && !existingObserver.pos.isEqualTo(layout.observer)) {
    if (isSafeToDestroy(room, existingObserver)) {
      destroy.push(existingObserver.id);
      build.push({ pos: layout.observer, structureType: STRUCTURE_OBSERVER });
    }
  }

  const roomName = room.name;

  const existingLabs = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LAB
  });
  const labPosSet = new Set(layout.labs.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const lab of existingLabs) {
    if (!labPosSet.has(lab.pos.x + ',' + lab.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, lab)) {
        destroy.push(lab.id);
      }
    }
  }
  for (const labPos of layout.labs) {
    const exists = existingLabs.some(l => l.pos.isEqualTo(labPos));
    if (!exists) {
      build.push({ pos: labPos, structureType: STRUCTURE_LAB });
    }
  }

  const existingLinks = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LINK
  });
  const linkPositions = [layout.linkSpawn, layout.linkController, layout.linkLab].filter(isWalkablePos);
  const linkPosSet = new Set(linkPositions.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const link of existingLinks) {
    if (!linkPosSet.has(link.pos.x + ',' + link.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, link)) {
        destroy.push(link.id);
      }
    }
  }
  for (const linkPos of linkPositions) {
    const exists = existingLinks.some(l => l.pos.isEqualTo(linkPos));
    if (!exists) {
      build.push({ pos: linkPos, structureType: STRUCTURE_LINK });
    }
  }

  const existingExtensions = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION
  });
  const extPosSet = new Set(layout.extensions.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const ext of existingExtensions) {
    if (!extPosSet.has(ext.pos.x + ',' + ext.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, ext)) {
        destroy.push(ext.id);
      }
    }
  }
  for (const extPos of layout.extensions) {
    const exists = existingExtensions.some(e => e.pos.isEqualTo(extPos));
    if (!exists) {
      build.push({ pos: extPos, structureType: STRUCTURE_EXTENSION });
    }
  }

  const existingRoads = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_ROAD
  });
  const roadPosSet = new Set(layout.roads.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const road of existingRoads) {
    if (!roadPosSet.has(road.pos.x + ',' + road.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, road)) {
        destroy.push(road.id);
      }
    }
  }
  for (const roadPos of layout.roads) {
    const exists = existingRoads.some(r => r.pos.isEqualTo(roadPos));
    if (!exists) {
      build.push({ pos: roadPos, structureType: STRUCTURE_ROAD });
    }
  }

  const existingRamparts = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_RAMPART
  });
  const rampartPosSet = new Set(layout.ramparts.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const r of existingRamparts) {
    if (!rampartPosSet.has(r.pos.x + ',' + r.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, r)) {
        destroy.push(r.id);
      }
    }
  }
  for (const rPos of layout.ramparts) {
    const exists = existingRamparts.some(r => r.pos.isEqualTo(rPos));
    if (!exists) {
      build.push({ pos: rPos, structureType: STRUCTURE_RAMPART });
    }
  }

  const existingWalls = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_WALL
  });
  const wallPosSet = new Set(layout.walls.map(p => p.x + ',' + p.y + ',' + roomName));
  for (const w of existingWalls) {
    if (!wallPosSet.has(w.pos.x + ',' + w.pos.y + ',' + roomName)) {
      if (isSafeToDestroy(room, w)) {
        destroy.push(w.id);
      }
    }
  }
  for (const wPos of layout.walls) {
    const exists = existingWalls.some(w => w.pos.isEqualTo(wPos));
    if (!exists) {
      build.push({ pos: wPos, structureType: STRUCTURE_WALL });
    }
  }

  const sortedBuild = sortByPriority(build);

  const { buildBudget } = getBudget(room);
  let totalCost = 0;
  const affordable = sortedBuild.filter(entry => {
    const cost = REBUILD_COSTS[entry.structureType] || 0;
    if (totalCost + cost <= buildBudget) {
      totalCost += cost;
      return true;
    }
    return false;
  });

  return {
    destroy,
    build: affordable,
    state: 'idle',
  };
}
```

- [ ] **Step 4: Delete `src/colony/Architect.ts`**

Run: `rm src/colony/Architect.ts`

- [ ] **Step 5: Update imports in `src/colony/Lifecycle.ts`**

Change:
```ts
import { getBudget } from '../lib/Cashflow';
```
This is fine — no Architect import in Lifecycle.ts. Verify.

- [ ] **Step 6: Update imports in `src/colony/AnchorPlanner.ts`**

Currently imports `getTerrainMatrix, isWalkable` from `../lib/PathFinder` and `findPath` from `../lib/PathFinder` — no change needed.

- [ ] **Step 7: Update imports in `src/colony/BarrierPlanner.ts`**

Currently imports `getTerrainMatrix, isWalkable` from `../lib/PathFinder` — no change needed.

- [ ] **Step 8: Update imports in `src/types/index.ts`**

Change:
```ts
import { BunkerLayout, SwapPlan } from '../colony/Architect';
```
→
```ts
import { BunkerLayout } from '../colony/LayoutPlanner';
import { SwapPlan } from '../colony/SwapPlanner';
```

- [ ] **Step 9: Update imports in `src/main.ts`**

Change:
```ts
import { planLayout, planSwap } from './colony/Architect';
```
→
```ts
import { planLayout } from './colony/LayoutPlanner';
import { planSwap } from './colony/SwapPlanner';
```

- [ ] **Step 10: Update imports in `src/roles/Builder.ts`**

Currently imports `moveTo` from `'../lib/Pathing'` and task functions from `'../lib/TaskManager'` — no Architect import needed. The `layout` variable is accessed via `creep.room.memory.layout` which is now typed.

- [ ] **Step 11: Build and verify**

Run: `npm run build`
Expected: No errors. Verify all exports resolve.

- [ ] **Step 12: Commit**

```bash
git add src/colony/BuildCosts.ts src/colony/LayoutPlanner.ts src/colony/SwapPlanner.ts src/types/index.ts src/main.ts
git rm src/colony/Architect.ts
git commit -m "refactor: split Architect.ts into BuildCosts, LayoutPlanner, SwapPlanner"
```

---

### Task 3: TerrainMatrix.ts → colony/TowerPlanner.ts + prune dead code

**Files:**
- Create: `src/colony/TowerPlanner.ts`
- Delete: `src/lib/TerrainMatrix.ts`
- Modify: `src/colony/LayoutPlanner.ts` (import path)

- [ ] **Step 1: Create `src/colony/TowerPlanner.ts`**

Copy from `src/lib/TerrainMatrix.ts`, remove `findChokepoints` and `findPerimeterPositions`:

```ts
import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';

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

function calculateCoverage(pos: RoomPosition, range: number, roomName: string): number {
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

  const candidates: { pos: RoomPosition; score: number }[] = [];

  for (let y = 5; y < 45; y++) {
    for (let x = 5; x < 45; x++) {
      if (!isWalkable(matrix, x, y)) continue;

      const pos = new RoomPosition(x, y, roomName);
      const coverage = calculateCoverage(pos, 10, roomName);

      const edgeDistance = Math.min(x, y, 49 - x, 49 - y);
      const score = coverage + edgeDistance * 2;

      candidates.push({ pos, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    positions.push(candidates[i].pos);
  }

  return positions;
}
```

- [ ] **Step 2: Delete `src/lib/TerrainMatrix.ts`**

Run: `rm src/lib/TerrainMatrix.ts`

- [ ] **Step 3: Update import in `src/colony/LayoutPlanner.ts`**

In `LayoutPlanner.ts`, change:
```ts
import { findOptimalTowerPositions } from '../lib/TerrainMatrix';
```
→
```ts
import { findOptimalTowerPositions } from './TowerPlanner';
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/colony/TowerPlanner.ts
git rm src/lib/TerrainMatrix.ts
git commit -m "refactor: move TerrainMatrix to colony/TowerPlanner, prune dead code"
```

---

### Task 4: Move Queen.ts → colony/, rename Lifecycle.ts → SwapExecutor.ts

**Files:**
- Move: `src/hatchery/Queen.ts` → `src/colony/Queen.ts`
- Rename: `src/colony/Lifecycle.ts` → `src/colony/SwapExecutor.ts`
- Modify: `src/main.ts` (import paths)
- Modify: `src/hatchery/Hatchery.ts` (import path — Queen doesn't import Hatchery, but Hatchery imports from Request)

- [ ] **Step 1: Move `src/hatchery/Queen.ts` to `src/colony/Queen.ts`**

Run: `mv src/hatchery/Queen.ts src/colony/Queen.ts`

Update imports in Queen.ts — change `./Request` and `./Hatchery` to `../hatchery/Request` and `../hatchery/Hatchery`:

```ts
import { Priority, SpawnRequest } from '../hatchery/Request';
import { request } from '../hatchery/Hatchery';
import { DeathWatchEntry, CashflowHealth } from '../types';
import { getHealth } from '../lib/Cashflow';
```

- [ ] **Step 2: Rename `src/colony/Lifecycle.ts` to `src/colony/SwapExecutor.ts`**

Run: `mv src/colony/Lifecycle.ts src/colony/SwapExecutor.ts`

No import changes needed in SwapExecutor.ts — it only imports `getBudget` from `../lib/Cashflow` which stays the same.

- [ ] **Step 3: Update imports in `src/main.ts`**

Change:
```ts
import { tick as queenTick } from './hatchery/Queen';
import { shouldRecheck, demolishMisplaced, buildMissing } from './colony/Lifecycle';
```
→
```ts
import { tick as queenTick } from './colony/Queen';
import { shouldRecheck, demolishMisplaced, buildMissing } from './colony/SwapExecutor';
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/colony/Queen.ts src/colony/SwapExecutor.ts src/main.ts
git rm src/hatchery/Queen.ts src/colony/Lifecycle.ts
git commit -m "refactor: move Queen to colony/, rename Lifecycle to SwapExecutor"
```

---

### Task 5: Extract Watchers, RoadDrainer, LayoutWatcher from main.ts

**Files:**
- Create: `src/colony/Watchers.ts`
- Create: `src/colony/RoadDrainer.ts`
- Create: `src/colony/LayoutWatcher.ts`
- Modify: `src/main.ts` (remove moved functions, add imports)

- [ ] **Step 1: Create `src/colony/Watchers.ts`**

```ts
export function hostileWatcher(room: Room): void {
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  if (hostiles.length === 0) return;

  const events = Memory.v1.events;
  if (!events) return;
  if (events.hostile?.[room.name]) return;

  if (!events.hostile) events.hostile = {};
  events.hostile[room.name] = {
    tick: Game.time,
    room: room.name,
    threat: hostiles.length > 3 ? 'swarm' : 'scout',
  };
}

export function expansionWatcher(room: Room): void {
  const rcl = room.controller?.level || 1;
  if (rcl < 4) return;

  const storage = room.storage;
  if (!storage) return;
  if ((storage.store[RESOURCE_ENERGY] || 0) < 500000) return;

  const events = Memory.v1.events;
  if (!events) return;
  if (events.expansion?.[room.name]) return;

  const exits = Game.map.describeExits(room.name);
  for (const exitKey in exits) {
    const exitRoom = exits[exitKey as unknown as ExitKey];
    if (!Game.rooms[exitRoom] || !Game.rooms[exitRoom].controller?.my) {
      if (!events.expansion) events.expansion = {};
      events.expansion[room.name] = {
        sourceRoom: room.name,
        targetRoom: exitRoom,
        tick: Game.time,
      };
      return;
    }
  }
}
```

- [ ] **Step 2: Create `src/colony/RoadDrainer.ts`**

```ts
const MAX_ROADS_PER_TICK = 5;

export function drainPendingRoads(room: Room): void {
  const ns = Memory.v1;
  if (!ns.pathing || !ns.pathing.pendingRoads) return;

  const pending = ns.pathing.pendingRoads;
  let placed = 0;

  for (let i = pending.length - 1; i >= 0 && placed < MAX_ROADS_PER_TICK; i--) {
    const entry = pending[i];
    if (entry.roomName !== room.name) continue;

    const result = room.createConstructionSite(entry.x, entry.y, STRUCTURE_ROAD);
    if (result === OK || result === ERR_INVALID_TARGET) {
      pending.splice(i, 1);
      if (result === OK) placed++;
    }
  }
}
```

- [ ] **Step 3: Create `src/colony/LayoutWatcher.ts`**

```ts
import { planLayout } from './LayoutPlanner';
import { planSwap } from './SwapPlanner';

export function recheckLayout(room: Room): void {
  if (Game.time % 200 !== 0) return;

  const layout = room.memory.layout;
  if (!layout || !layout.bunker) return;

  let needsReplan = false;

  for (const towerPos of layout.bunker.towers) {
    const tower = room.lookForAt(LOOK_STRUCTURES, towerPos.x, towerPos.y)
      .find(s => s.structureType === STRUCTURE_TOWER);
    if (!tower) {
      needsReplan = true;
      break;
    }
  }

  const existingSpawns = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_SPAWN
  });

  if (existingSpawns.length > 0) {
    const spawn = existingSpawns[0];
    if (!spawn.pos.isEqualTo(layout.bunker.spawn)) {
      needsReplan = true;
    }
  }

  if (needsReplan) {
    const newLayout = planLayout(room);
    const newSwapPlan = planSwap(room, newLayout);
    room.memory.layout = { bunker: newLayout, swap: newSwapPlan, lastUpdated: Game.time };
  }
}
```

- [ ] **Step 4: Remove moved functions from `src/main.ts` and add imports**

Remove these function definitions from main.ts:
- `hostileWatcher` (lines 50-64)
- `expansionWatcher` (lines 66-91)
- `drainPendingRoads` (lines 93-112)
- `recheckLayout` (lines 114-147)

Add imports at top:
```ts
import { hostileWatcher, expansionWatcher } from './colony/Watchers';
import { drainPendingRoads } from './colony/RoadDrainer';
import { recheckLayout } from './colony/LayoutWatcher';
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/colony/Watchers.ts src/colony/RoadDrainer.ts src/colony/LayoutWatcher.ts src/main.ts
git commit -m "refactor: extract watchers, road drainer, layout watcher from main.ts"
```

---

### Task 6: Clean up main.ts — slim to orchestrator

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Verify main.ts is now a thin orchestrator**

After all previous tasks, main.ts should be ~80 lines, structured like:

```ts
// src/main.ts

import { tick as queenTick } from './colony/Queen';
import { process as hatcheryProcess } from './hatchery/Hatchery';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory } from './lib/Memory';
import { getTerrainMatrix } from './lib/PathFinder';
import { shouldRecheck, demolishMisplaced, buildMissing } from './colony/SwapExecutor';
import { planLayout } from './colony/LayoutPlanner';
import { planSwap } from './colony/SwapPlanner';
import { hostileWatcher, expansionWatcher } from './colony/Watchers';
import { drainPendingRoads } from './colony/RoadDrainer';
import { recheckLayout } from './colony/LayoutWatcher';
import * as HUD from './lib/HUD';
import { trackIncome, getHealth, trackBuild, getCpuBudgets } from './lib/Cashflow';

const ALWAYS_RUN_ROLES = new Set(['harvester', 'hauler']);
const PRODUCTION_ROLES = new Set(['builder', 'upgrader']);

function runCreep(creep: Creep, budgetHard: number): void {
  const role = creep.memory.role;

  if (ALWAYS_RUN_ROLES.has(role)) {
  } else if (PRODUCTION_ROLES.has(role)) {
    if (Game.cpu.getUsed() >= budgetHard) return;
  } else {
    if (Game.cpu.getUsed() >= budgetHard) return;
  }

  switch (role) {
    case 'harvester': Harvester.run(creep); break;
    case 'hauler':    Hauler.run(creep);    break;
    case 'builder':   Builder.run(creep);   break;
    case 'upgrader':  Upgrader.run(creep);  break;
  }
}

function runCreeps(room: Room): void {
  const { hard: budgetHard } = getCpuBudgets();

  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.roomName !== room.name) continue;

    ensureCreepMemory(creep);
    runCreep(creep, budgetHard);
  }
}

export const loop = (): void => {
  if (Memory.v1 && !Memory.v1) {
    Memory.v1 = Memory.v1;
  }

  ensureMemoryNs();

  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }

  if (Game.time % 100 === 0) {
    cleanLegacyMemory();
  }

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;

    ensureRoomMemory(room);

    queenTick(room);

    const prevTotal = Memory.v1._prevTotalEnergy?.[roomName] ?? -1;
    const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
    if (prevTotal >= 0) {
      trackIncome(roomName, currentTotal, prevTotal);
    }
    if (!Memory.v1._prevTotalEnergy) Memory.v1._prevTotalEnergy = {};
    Memory.v1._prevTotalEnergy[roomName] = currentTotal;

    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const health = getHealth(room);
      if (health !== 'red' || !room.memory.layout) {
        const layout = planLayout(room);
        const swapPlan = planSwap(room, layout);
        room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
      }
    }

    if (room.memory.layout && room.memory.layout.swap) {
      if (shouldRecheck(room)) {
        demolishMisplaced(room, room.memory.layout.swap);
      } else if (shouldRecheck(room, 1)) {
        buildMissing(room, room.memory.layout.swap);
      }
    }

    drainPendingRoads(room);
    recheckLayout(room);

    hostileWatcher(room);
    expansionWatcher(room);

    hatcheryProcess(room);

    runCreeps(room);

    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    let progressDelta = 0;
    for (const site of sites) {
      const prev = Memory.v1._prevProgress?.[site.id] || site.progress;
      progressDelta += Math.max(0, site.progress - prev);
      if (!Memory.v1._prevProgress) Memory.v1._prevProgress = {};
      Memory.v1._prevProgress[site.id] = site.progress;
    }
    if (progressDelta > 0) {
      trackBuild(roomName, progressDelta);
    }

    HUD.run(room);
  }
};
```

Note: The `loop()` function has a no-op migration check at startup (`if (Memory.v1 && !Memory.v1)` — this is a bug in the original code, it should be `if (Memory.v1 && !Memory[CURRENT_NS])` but we preserve it as-is since this is a restructure, not a behavior fix).

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "refactor: slim main.ts to orchestrator, all logic extracted"
```

---

### Task 7: Final build verification

**Files:** None — just verify the whole build.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: No errors. Only pre-existing TS warnings (type import issues from @types/screeps, STRUCTURE_FACTORY not found, etc.)

- [ ] **Step 2: Verify file structure**

Run: `ls -R src/`
Expected:
```
src/:
colony  hatchery  lib  main.ts  roles  types

src/colony:
AnchorPlanner.ts  BarrierPlanner.ts  BuildCosts.ts  LayoutPlanner.ts  LayoutWatcher.ts  Queen.ts  RoadDrainer.ts  SwapExecutor.ts  SwapPlanner.ts  TowerPlanner.ts  Watchers.ts

src/hatchery:
Body.ts  Hatchery.ts  Request.ts

src/lib:
Cashflow.ts  HUD.ts  helpers.ts  Memory.ts  PathFinder.ts  Pathing.ts  TaskManager.ts

src/roles:
Builder.ts  Harvester.ts  Hauler.ts  Upgrader.ts

src/types:
index.ts
```

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git status  # verify no stray files
git commit -m "chore: final cleanup after codebase restructure"
```

---

## Summary: What changed

| From | To | Reason |
|------|----|--------|
| `colony/Architect.ts` | `colony/BuildCosts.ts`, `LayoutPlanner.ts`, `SwapPlanner.ts` | Split monolith (606→3 files) |
| `hatchery/Queen.ts` | `colony/Queen.ts` | Queen is colony manager, not spawn |
| `colony/Lifecycle.ts` | `colony/SwapExecutor.ts` | Name reflects actual purpose |
| `lib/TerrainMatrix.ts` | `colony/TowerPlanner.ts` | Only used by colony planning; pruned dead code |
| `main.ts` (227 lines) | `main.ts` (~80 lines) + `Watchers.ts`, `RoadDrainer.ts`, `LayoutWatcher.ts` | Thin orchestrator |
| `(Memory.v1 as any)` everywhere | Fully typed Memory | Type safety, no casts |
| Missing CreepMemory fields | `_stuckTicks`, `_lastPos`, `_path` typed | No more `as` casts |