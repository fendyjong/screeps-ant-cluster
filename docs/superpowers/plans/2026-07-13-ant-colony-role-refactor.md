# Ant Colony Role Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task persistence, priority action chains, CPU gating, and event directives to Screeps role system.

**Architecture:** Four Overmind-inspired patterns adapted to existing ant colony: (1) serializable task in `creep.memory.task` so creeps don't re-decide every tick, (2) priority-ordered action chain replaces dead `Goal` enum, (3) 3-tier CPU gating by `Game.cpu.getUsed()`, (4) event-driven watchers replace Queen polling.

**Tech Stack:** TypeScript + Rollup, Screeps globals only (no npm runtime deps)

---

### Task 1: Clean up types — remove Goal, add TaskMemory

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/Memory.ts`

- [ ] **Step 1: Update types/index.ts**

Delete `Goal` enum. Add `TaskMemory` interface. Remove `Goal` from `RoomMemory`.

Replace the entire file content:

```typescript
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
}

export interface PathingMemory {
	terrain: Record<string, TerrainCache>;
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

export type CashflowHealth = 'green' | 'yellow' | 'red';

export interface CashflowMemory {
	incomeRate: number
	spawnRate: number
	buildRate: number
}

// Screeps event signals for directive-style spawning
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
		}
		pathing?: PathingMemory
	}
}
```

- [ ] **Step 2: Update src/lib/Memory.ts**

Remove all references to `Goal` and `goal`. Replace `ensureRoomMemory` — no longer sets `goal`. Replace `ensureCreepMemory` — add empty task.

```typescript
// src/lib/Memory.ts

export const CURRENT_NS = 'v1';

const ENGINE_KEYS: Record<string, true> = {
  creeps: true,
  rooms: true,
  flags: true,
  powerCreeps: true,
};

export function ensureRoomMemory(room: Room): void {
  // Nothing required — layout is optional
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

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: compiles without errors (may get unused-import warnings, that's fine)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/Memory.ts
git commit -m "refactor: remove Goal enum, add TaskMemory and GameEvents types"
```

---

### Task 2: TaskManager utility

**Files:**
- Create: `src/lib/TaskManager.ts`

- [ ] **Step 1: Write src/lib/TaskManager.ts**

Shared utility for managing task lifecycle. Each function is self-contained.

```typescript
// src/lib/TaskManager.ts

import { TaskMemory } from '../types';
import { moveTo } from './Pathing';

export function getTask(creep: Creep): TaskMemory | null {
	return creep.memory.task || null;
}

export function setTask(creep: Creep, type: TaskMemory['type'], targetId: string): void {
	creep.memory.task = { type, targetId };
}

export function clearTask(creep: Creep): void {
	delete creep.memory.task;
}

export function isValidTask(creep: Creep): boolean {
	const task = creep.memory.task;
	if (!task || !task.targetId) return false;
	const target = Game.getObjectById(task.targetId);
	if (!target) return false;

	switch (task.type) {
		case 'harvest':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		case 'transfer':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'withdraw':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && (target as AnyStoreStructure).store[RESOURCE_ENERGY] > 0;
		case 'pickup':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		case 'build':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'repair':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && (target as Structure).hits < (target as Structure).hitsMax;
		case 'upgrade':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'dismantle':
			return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
		case 'recharge':
			return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
		default:
			return false;
	}
}

export function executeTask(creep: Creep): 'ok' | 'working' | 'invalid' {
	const task = creep.memory.task;
	if (!task || !task.targetId) return 'invalid';

	const target = Game.getObjectById(task.targetId);
	if (!target) {
		clearTask(creep);
		return 'invalid';
	}

	let result: number;

	switch (task.type) {
		case 'harvest':
			result = creep.harvest(target as Source);
			break;
		case 'transfer':
			result = creep.transfer(target as AnyStructure, RESOURCE_ENERGY);
			break;
		case 'withdraw':
			result = creep.withdraw(target as AnyStoreStructure, RESOURCE_ENERGY);
			break;
		case 'pickup':
			result = creep.pickup(target as Resource);
			break;
		case 'build':
			result = creep.build(target as ConstructionSite);
			break;
		case 'repair':
			result = creep.repair(target as Structure);
			break;
		case 'upgrade':
			result = creep.upgradeController(target as StructureController);
			break;
		case 'dismantle':
			result = creep.dismantle(target as Structure);
			break;
		case 'recharge':
			if (target instanceof Resource) {
				result = creep.pickup(target);
			} else if (target instanceof Tombstone) {
				result = creep.withdraw(target, RESOURCE_ENERGY);
			} else {
				result = creep.withdraw(target as AnyStoreStructure, RESOURCE_ENERGY);
			}
			break;
		default:
			return 'invalid';
	}

	if (result === OK) {
		// Task completed — check if we should clear
		switch (task.type) {
			case 'harvest':
				if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
			case 'transfer':
				if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
			case 'withdraw':
			case 'pickup':
			case 'recharge':
				if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
			case 'build':
			case 'repair':
			case 'upgrade':
			case 'dismantle':
				if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
					clearTask(creep);
					return 'ok';
				}
				break;
		}
		return 'ok';
	}

	if (result === ERR_NOT_IN_RANGE) {
		moveTo(creep, target as any);
		return 'working';
	}

	if (result === ERR_INVALID_TARGET) {
		clearTask(creep);
		return 'invalid';
	}

	return 'working';
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/TaskManager.ts
git commit -m "feat: add TaskManager utility for task persistence"
```

---

### Task 3: CPU budget function

**Files:**
- Modify: `src/lib/Cashflow.ts`

- [ ] **Step 1: Add getCpuBudgets to Cashflow.ts**

Append at end of file:

```typescript
export function getCpuBudgets(): { soft: number; hard: number } {
	const limit = Game.cpu.limit;
	const bucket = Game.cpu.bucket;
	const safeCapacity = limit * 0.85;
	return {
		soft: Math.min(safeCapacity, Math.max(limit * 0.3, bucket * 0.05)),
		hard: Math.min(safeCapacity, Math.max(limit * 0.5, bucket * 0.1)),
	};
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/Cashflow.ts
git commit -m "feat: add getCpuBudgets for CPU-aware gating"
```

---

### Task 4: Rewrite Harvester role

**Files:**
- Modify: `src/roles/Harvester.ts`

- [ ] **Step 1: Rewrite src/roles/Harvester.ts**

Remove `Goal` import. Add task-first pattern and priority chain.

```typescript
// src/roles/Harvester.ts

import { moveTo } from '../lib/Pathing';
import { getTerrainMatrix } from '../lib/TerrainMatrix';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

function findSource(creep: Creep): Source | null {
	const sources = creep.room.find(FIND_SOURCES_ACTIVE);
	if (sources.length === 0) {
		const allSources = creep.room.find(FIND_SOURCES);
		return allSources[0] || null;
	}

	const harvesters = creep.room.find(FIND_MY_CREEPS, {
		filter: (c: Creep) => c.memory.role === 'harvester' && c.name !== creep.name
	});

	let best: Source | null = null;
	let bestScore = Infinity;

	for (const source of sources) {
		const dist = creep.pos.getRangeTo(source);
		const harvesterCount = harvesters.filter((h: Creep) =>
			h.memory.task?.targetId === source.id
		).length;
		const score = dist * 10 + harvesterCount;
		if (score < bestScore) {
			bestScore = score;
			best = source;
		}
	}

	return best;
}

function findDropOff(creep: Creep): Structure | null {
	const targets = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => (
			(s.structureType === STRUCTURE_CONTAINER ||
			 s.structureType === STRUCTURE_STORAGE) &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});

	if (targets.length > 0) {
		return creep.pos.findClosestByPath(targets);
	}

	const spawnTargets = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			(s.structureType === STRUCTURE_SPAWN ||
			 s.structureType === STRUCTURE_EXTENSION) &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});

	if (spawnTargets.length > 0) {
		return creep.pos.findClosestByPath(spawnTargets);
	}

	return null;
}

function actionHarvest(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'harvest' && isValidTask(creep)) return true;

	const source = findSource(creep);
	if (!source) return false;
	setTask(creep, 'harvest', source.id);

	const totalAdj = [
		{ dx: -1, dy: 0 }, { dx: 1, dy: 0 },
		{ dx: 0, dy: -1 }, { dx: 0, dy: 1 },
		{ dx: -1, dy: -1 }, { dx: 1, dy: -1 },
		{ dx: -1, dy: 1 }, { dx: 1, dy: 1 },
	].filter(d => {
		const x = source.pos.x + d.dx, y = source.pos.y + d.dy;
		if (x < 0 || x >= 50 || y < 0 || y >= 50) return false;
		return getTerrainMatrix(creep.room.name).get(x, y) < 255;
	}).length;

	const busyAdj = source.pos.findInRange(FIND_MY_CREEPS, 1)
		.filter((c: Creep) => c.pos.getRangeTo(source) === 1).length;

	if (busyAdj >= totalAdj && totalAdj > 0 && creep.pos.getRangeTo(source) <= 1) {
		const freeSpots = [
			{ dx: -1, dy: 0 }, { dx: 1, dy: 0 },
			{ dx: 0, dy: -1 }, { dx: 0, dy: 1 },
			{ dx: -1, dy: -1 }, { dx: 1, dy: -1 },
			{ dx: -1, dy: 1 }, { dx: 1, dy: 1 },
		]
			.map(d => new RoomPosition(source.pos.x + d.dx, source.pos.y + d.dy, creep.room.name))
			.filter(p => {
				if (p.x < 0 || p.x >= 50 || p.y < 0 || p.y >= 50) return false;
				return getTerrainMatrix(creep.room.name).get(p.x, p.y) < 255
					&& creep.room.lookForAt(LOOK_CREEPS, p.x, p.y).length === 0;
			});
		if (freeSpots.length > 0) {
			moveTo(creep, freeSpots[0]);
			return true;
		}
	}

	return true;
}

function actionTransfer(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'transfer' && isValidTask(creep)) return true;

	const dropOff = findDropOff(creep);
	if (!dropOff) return false;
	setTask(creep, 'transfer', dropOff.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionHarvest,
	actionTransfer,
];

export function run(creep: Creep): void {
	if (isValidTask(creep)) {
		const result = executeTask(creep);
		if (result !== 'invalid') return;
	}
	for (const action of PRIORITY) {
		if (action(creep)) {
			executeTask(creep);
			return;
		}
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/roles/Harvester.ts
git commit -m "refactor: Harvester with task persistence and priority chain"
```

---

### Task 5: Rewrite Hauler role

**Files:**
- Modify: `src/roles/Hauler.ts`

- [ ] **Step 1: Rewrite src/roles/Hauler.ts**

Same pattern as Harvester: remove `Goal`, add task-first + priority chain.

```typescript
import { moveTo } from '../lib/Pathing';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

function findEnergy(creep: Creep): Resource | Structure | null {
	const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
	});
	if (droppedEnergy.length > 0) {
		return creep.pos.findClosestByPath(droppedEnergy);
	}

	const containers = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => (
			s.structureType === STRUCTURE_CONTAINER &&
			s.store[RESOURCE_ENERGY] > 0
		)
	});
	if (containers.length > 0) {
		return creep.pos.findClosestByPath(containers);
	}

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			s.structureType === STRUCTURE_STORAGE &&
			s.store[RESOURCE_ENERGY] > 0
		)
	});
	if (storage.length > 0) {
		return storage[0];
	}

	return null;
}

function findDropOff(creep: Creep): Structure | null {
	const targets = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			(s.structureType === STRUCTURE_SPAWN ||
			 s.structureType === STRUCTURE_EXTENSION) &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});
	if (targets.length > 0) {
		return creep.pos.findClosestByPath(targets);
	}

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => (
			s.structureType === STRUCTURE_STORAGE &&
			s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
		)
	});
	if (storage.length > 0) {
		return storage[0];
	}

	return null;
}

function actionPickup(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'pickup' && isValidTask(creep)) return true;

	const energy = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
	});
	if (energy.length === 0) return false;
	const closest = creep.pos.findClosestByPath(energy);
	if (!closest) return false;
	setTask(creep, 'pickup', closest.id);
	return true;
}

function actionWithdraw(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'withdraw' && isValidTask(creep)) return true;

	const energy = findEnergy(creep);
	if (!energy) return false;
	setTask(creep, 'withdraw', energy.id);
	return true;
}

function actionTransfer(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'transfer' && isValidTask(creep)) return true;

	const dropOff = findDropOff(creep);
	if (!dropOff) return false;
	setTask(creep, 'transfer', dropOff.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionPickup,
	actionWithdraw,
	actionTransfer,
];

export function run(creep: Creep): void {
	if (isValidTask(creep)) {
		const result = executeTask(creep);
		if (result !== 'invalid') return;
	}
	for (const action of PRIORITY) {
		if (action(creep)) {
			executeTask(creep);
			return;
		}
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/roles/Hauler.ts
git commit -m "refactor: Hauler with task persistence and priority chain"
```

---

### Task 6: Rewrite Upgrader role

**Files:**
- Modify: `src/roles/Upgrader.ts`

- [ ] **Step 1: Rewrite src/roles/Upgrader.ts**

No more self-harvest from sources. Priority: upgrade → recharge from containers/storage.

```typescript
import { moveTo } from '../lib/Pathing';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

function findEnergySource(creep: Creep): AnyStoreStructure | Resource | Tombstone | null {
	// Prefer container, then storage, then dropped, then tombstone
	const containers = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
	});
	if (containers.length > 0) return creep.pos.findClosestByPath(containers);

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
	});
	if (storage.length > 0) return storage[0];

	const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
	});
	if (dropped.length > 0) return creep.pos.findClosestByPath(dropped);

	return null;
}

function actionUpgrade(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'upgrade' && isValidTask(creep)) return true;

	const controller = creep.room.controller;
	if (!controller) return false;
	setTask(creep, 'upgrade', controller.id);
	return true;
}

function actionRecharge(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'recharge' && isValidTask(creep)) return true;

	const source = findEnergySource(creep);
	if (!source) return false;
	setTask(creep, 'recharge', source.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionUpgrade,
	actionRecharge,
];

export function run(creep: Creep): void {
	if (isValidTask(creep)) {
		const result = executeTask(creep);
		if (result !== 'invalid') return;
	}
	for (const action of PRIORITY) {
		if (action(creep)) {
			executeTask(creep);
			return;
		}
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/roles/Upgrader.ts
git commit -m "refactor: Upgrader with task persistence, no more self-harvest"
```

---

### Task 7: Rewrite Builder role

**Files:**
- Modify: `src/roles/Builder.ts`

- [ ] **Step 1: Rewrite src/roles/Builder.ts**

Same task-first pattern. Swap plan state is per-task (target locks structure to dismantle), fixing the race condition.

```typescript
import { moveTo } from '../lib/Pathing';
import { getTask, setTask, clearTask, isValidTask, executeTask } from '../lib/TaskManager';

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

function findRechargeSource(creep: Creep): AnyStoreStructure | null {
	const containers = creep.room.find(FIND_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
	});
	if (containers.length > 0) return creep.pos.findClosestByPath(containers);

	const storage = creep.room.find(FIND_MY_STRUCTURES, {
		filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
	});
	if (storage.length > 0) return storage[0];

	return null;
}

function actionDismantle(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	const layout = creep.room.memory.layout;
	const swapPlan = layout?.swap;
	if (!swapPlan || swapPlan.destroy.length === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'dismantle' && isValidTask(creep)) return true;

	// Pick next structure to dismantle
	let demolishCount = 0;
	for (let i = 0; i < swapPlan.destroy.length && demolishCount < MAX_DEMOLISH_PER_TICK; i++) {
		const structureId = swapPlan.destroy[i];
		const structure = Game.getObjectById(structureId) as Structure | null;
		if (!structure) {
			swapPlan.destroy.splice(i, 1);
			i--;
			continue;
		}
		// Check no other builder already targeting this
		const alreadyTargeted = Object.values(Game.creeps).some(c =>
			c.memory.role === 'builder' && c.memory.task?.targetId === structureId && c.name !== creep.name
		);
		if (alreadyTargeted) continue;

		setTask(creep, 'dismantle', structureId);
		return true;
	}

	return false;
}

function actionBuildFromSwap(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	const layout = creep.room.memory.layout;
	const swapPlan = layout?.swap;
	if (!swapPlan || swapPlan.build.length === 0) return false;

	const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
	for (const entry of swapPlan.build) {
		const site = sites.find(s =>
			s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
		);
		if (site) {
			setTask(creep, 'build', site.id);
			return true;
		}
	}

	return false;
}

function actionBuild(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'build' && isValidTask(creep)) return true;

	const site = findConstructionSite(creep);
	if (!site) return false;
	setTask(creep, 'build', site.id);
	return true;
}

function actionRepair(creep: Creep): boolean {
	if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'repair' && isValidTask(creep)) return true;

	const structure = findDamagedStructure(creep);
	if (!structure) return false;
	setTask(creep, 'repair', structure.id);
	return true;
}

function actionRecharge(creep: Creep): boolean {
	if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

	let task = getTask(creep);
	if (task && task.type === 'recharge' && isValidTask(creep)) return true;

	const source = findRechargeSource(creep);
	if (!source) return false;
	setTask(creep, 'recharge', source.id);
	return true;
}

export const PRIORITY: ((creep: Creep) => boolean)[] = [
	actionDismantle,
	actionBuildFromSwap,
	actionBuild,
	actionRepair,
	actionRecharge,
];

export function run(creep: Creep): void {
	if (isValidTask(creep)) {
		const result = executeTask(creep);
		if (result !== 'invalid') return;
	}
	for (const action of PRIORITY) {
		if (action(creep)) {
			executeTask(creep);
			return;
		}
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/roles/Builder.ts
git commit -m "refactor: Builder with task persistence, fix swap plan race"
```

---

### Task 8: Queen cleanup and event directives

**Files:**
- Modify: `src/hatchery/Queen.ts`

- [ ] **Step 1: Rewrite src/hatchery/Queen.ts**

Remove dead role presets (scout, claimer, attacker, healer from main loop). Remove `maybeRequestRoomExpansion()`. Add event consumer that checks `Memory.v1.events` for hostile/expansion signals.

```typescript
// src/hatchery/Queen.ts

import { BodyPartConstant } from 'screeps';
import { Priority, SpawnRequest } from './Request';
import { request } from './Hatchery';
import { DeathWatchEntry, CashflowHealth } from '../types';
import { getHealth } from '../lib/Cashflow';

const ROLE_PRIORITIES: Record<string, number> = {
	harvester: Priority.HIGH,
	hauler: Priority.NORMAL,
	builder: Priority.NORMAL,
	upgrader: Priority.NORMAL,
	defender: Priority.HIGH,
};

const DEFAULT_BODIES: Record<string, { min: BodyPartConstant[]; ideal: BodyPartConstant[] }> = {
	harvester: {
		min: [WORK, CARRY, MOVE],
		ideal: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
	},
	hauler: {
		min: [CARRY, CARRY, MOVE],
		ideal: [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
	},
	builder: {
		min: [WORK, CARRY, MOVE],
		ideal: [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
	},
	upgrader: {
		min: [WORK, CARRY, MOVE],
		ideal: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
	},
	defender: {
		min: [TOUGH, ATTACK, ATTACK, MOVE],
		ideal: [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE],
	},
};

interface PhaseConfig {
	floor: Record<string, number>
	scaling: Record<string, { threshold: number; increment: number }>
}

function getPhaseConfig(room: Room): PhaseConfig {
	const rcl = room.controller?.level || 1;
	const energyRatio = room.energyAvailable / Math.max(room.energyCapacityAvailable, 1);

	if (rcl <= 2 && energyRatio < 0.8) {
		return {
			floor: { harvester: 2, hauler: 1 },
			scaling: {},
		};
	}

	if (rcl <= 2) {
		return {
			floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
			scaling: { hauler: { threshold: 5000, increment: 1 } },
		};
	}

	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	const hasSites = sites.length > 0;

	const missingCritical = (type: StructureConstant): boolean => {
		const have = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === type }).length;
		const need = CONTROLLER_STRUCTURES[type]?.[rcl] || 0;
		return have < need;
	};

	const missingExtensions = missingCritical(STRUCTURE_EXTENSION);
	const missingTowers = missingCritical(STRUCTURE_TOWER);

	if (rcl <= 4 && (missingExtensions || missingTowers)) {
		return {
			floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
			scaling: {
				builder: { threshold: 30000, increment: 1 },
				upgrader: { threshold: 5000, increment: 1 },
			},
		};
	}

	if (rcl >= 8 || (!hasSites && rcl >= 5)) {
		return {
			floor: { harvester: 2, hauler: 1, upgrader: 1 },
			scaling: {
				upgrader: { threshold: 10000, increment: 1 },
			},
		};
	}

	if (hasSites && rcl >= 5) {
		return {
			floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
			scaling: {
				hauler: { threshold: 10000, increment: 1 },
				builder: { threshold: 20000, increment: 1 },
			},
		};
	}

	return {
		floor: { harvester: 2, hauler: 1, upgrader: 1 },
		scaling: {},
	};
}

function computeTargets(room: Room, health: CashflowHealth): Record<string, number> {
	const phase = getPhaseConfig(room);
	const targets: Record<string, number> = { ...phase.floor };

	const stored = room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	const backlog = sites.reduce((sum, s) => sum + (s.progressTotal - s.progress), 0);

	for (const [role, cfg] of Object.entries(phase.scaling)) {
		let extra = 0;
		const threshold = health === 'red' ? cfg.threshold * 2 : cfg.threshold;
		if (role === 'builder') {
			extra = Math.floor(backlog / threshold) * cfg.increment;
		} else {
			extra = Math.floor(stored / threshold) * cfg.increment;
		}
		targets[role] = (targets[role] || 0) + extra;
	}

	return targets;
}

function isEconomyLocked(room: Room): boolean {
	const harvesters = Object.values(Game.creeps).filter(
		c => c.memory.roomName === room.name && c.memory.role === 'harvester'
	);
	return room.energyAvailable < 200 && harvesters.length === 0;
}

function scanCreeps(room: Room): { live: Record<string, number>; soonDead: Record<string, number>; deathWatch: Record<string, DeathWatchEntry[]> } {
	const live: Record<string, number> = {};
	const soonDead: Record<string, number> = {};
	const deathWatch: Record<string, DeathWatchEntry[]> = {};
	for (const name in Game.creeps) {
		const creep = Game.creeps[name];
		if (creep.memory.roomName !== room.name) continue;
		const role = creep.memory.role || 'unknown';
		live[role] = (live[role] || 0) + 1;
		const ttl = creep.ticksToLive;
		if (ttl !== undefined && ttl < 100) {
			soonDead[role] = (soonDead[role] || 0) + 1;
			if (!deathWatch[role]) deathWatch[role] = [];
			deathWatch[role].push({ name, ttl });
		}
	}
	return { live, soonDead, deathWatch };
}

function processEvents(room: Room): void {
	const events = Memory.v1.events;
	if (!events) return;

	// Hostile event — spawn defender
	if (events.hostile?.[room.name]) {
		const bodyDef = DEFAULT_BODIES.defender;
		const spawnReq: SpawnRequest = {
			role: 'defender',
			priority: Priority.CRITICAL,
			body: bodyDef,
			count: 1,
			memory: {},
			createdAt: Game.time,
			roomName: room.name,
		};
		request(spawnReq);
		delete events.hostile[room.name];
	}

	// Expansion event — spawn claimer + remote harvesters
	if (events.expansion?.[room.name]) {
		const ev = events.expansion[room.name];
		const claimReq: SpawnRequest = {
			role: 'claimer',
			priority: Priority.LOW,
			body: { min: [CLAIM, MOVE], ideal: [CLAIM, MOVE] },
			count: 1,
			memory: { targetRoom: ev.targetRoom, claim: true },
			createdAt: Game.time,
			roomName: room.name,
		};
		request(claimReq);

		const remoteHarvester: SpawnRequest = {
			role: 'harvester',
			priority: Priority.LOW,
			body: DEFAULT_BODIES.harvester,
			count: 2,
			memory: { remoteRoom: ev.targetRoom },
			createdAt: Game.time,
			roomName: room.name,
		};
		request(remoteHarvester);

		const remoteHauler: SpawnRequest = {
			role: 'hauler',
			priority: Priority.LOW,
			body: DEFAULT_BODIES.hauler,
			count: 1,
			memory: { remoteRoom: ev.targetRoom },
			createdAt: Game.time,
			roomName: room.name,
		};
		request(remoteHauler);

		delete events.expansion[room.name];
	}
}

export function tick(room: Room): void {
	if (!Memory.v1) Memory.v1 = {} as Memory['v1'];
	if (!Memory.v1.hatchery) Memory.v1.hatchery = { queue: {}, deathWatch: {} };
	if (!Memory.v1.hatchery.deathWatch[room.name]) Memory.v1.hatchery.deathWatch[room.name] = {};
	if (!Memory.v1.events) Memory.v1.events = {};

	const { live, soonDead, deathWatch } = scanCreeps(room);
	Memory.v1.hatchery.deathWatch[room.name] = deathWatch;

	const locked = isEconomyLocked(room);
	const targets = computeTargets(room, getHealth(room));

	const roleOrder = ['harvester', 'hauler', 'builder', 'upgrader', 'defender'];

	for (const role of roleOrder) {
		const target = targets[role] || 0;

		if (locked && role !== 'harvester' && role !== 'hauler') continue;

		const alive = live[role] || 0;
		const dying = soonDead[role] || 0;
		const need = Math.max(0, target + dying - alive);

		if (need <= 0) continue;

		const basePrio = ROLE_PRIORITIES[role] || Priority.NORMAL;
		let priority = basePrio;

		const dw = deathWatch[role] || [];
		const minTtl = dw.length > 0 ? Math.min(...dw.map(e => e.ttl)) : 999;

		if (minTtl < 20) priority = Math.min(priority, 50);
		else if (minTtl < 100) priority = Math.min(priority, 150);

		const bodyDef = DEFAULT_BODIES[role] || DEFAULT_BODIES.harvester;

		const spawnReq: SpawnRequest = {
			role,
			priority,
			body: bodyDef,
			count: need,
			memory: {},
			createdAt: Game.time,
			roomName: room.name,
		};

		request(spawnReq);
	}

	// Process event-driven spawns
	processEvents(room);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/hatchery/Queen.ts
git commit -m "refactor: Queen cleanup — remove dead roles, add event-driven spawning"
```

---

### Task 9: main.ts integration — tiered dispatch, watchers, event wiring

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Rewrite src/main.ts**

Replace `runCreeps` with tiered dispatch. Add watcher functions for hostiles and expansion. Add CPU budget checks.

Full content:

```typescript
// src/main.ts

import { tick as queenTick } from './hatchery/Queen';
import { process as hatcheryProcess } from './hatchery/Hatchery';
import * as Harvester from './roles/Harvester';
import * as Hauler from './roles/Hauler';
import * as Builder from './roles/Builder';
import * as Upgrader from './roles/Upgrader';
import { ensureRoomMemory, ensureCreepMemory, ensureMemoryNs, cleanLegacyMemory, CURRENT_NS } from './lib/Memory';
import { getTerrainMatrix } from './lib/TerrainMatrix';
import { planLayout, planSwap } from './colony/Architect';
import * as HUD from './lib/HUD';
import { trackIncome, getBudget, getHealth, trackBuild, getCpuBudgets } from './lib/Cashflow';

const ALWAYS_RUN_ROLES = new Set(['harvester', 'hauler']);
const PRODUCTION_ROLES = new Set(['builder', 'upgrader']);

function runCreep(creep: Creep, budgetHard: number): void {
	const role = creep.memory.role;

	// Tier 1: always run — harvester, hauler
	if (ALWAYS_RUN_ROLES.has(role)) {
		// run
	} else if (PRODUCTION_ROLES.has(role)) {
		// Tier 2: run if under hard limit
		if (Game.cpu.getUsed() >= budgetHard) return;
	} else {
		// Tier 3: burst roles — only run when specifically gated (defender via events)
		// These are spawned by event directives and should always run if alive
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

// Watchers — cheap checks that fire events for Queen to consume
function hostileWatcher(room: Room): void {
	const hostiles = room.find(FIND_HOSTILE_CREEPS);
	if (hostiles.length === 0) return;

	const events = Memory.v1.events;
	if (!events) return;
	if (events.hostile?.[room.name]) return; // already queued

	if (!events.hostile) events.hostile = {};
	events.hostile[room.name] = {
		tick: Game.time,
		room: room.name,
		threat: hostiles.length > 3 ? 'swarm' : 'scout',
	};
}

function expansionWatcher(room: Room): void {
	const rcl = room.controller?.level || 1;
	if (rcl < 4) return;

	const storage = room.storage;
	if (!storage) return;
	if ((storage.store[RESOURCE_ENERGY] || 0) < 500000) return;

	const events = Memory.v1.events;
	if (!events) return;
	if (events.expansion?.[room.name]) return; // already queued

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
			return; // one expansion at a time
		}
	}
}

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
  const { buildBudget } = getBudget(room);
  if (buildBudget <= 0) return;

  const layout = room.memory.layout;
  if (!layout || !layout.swap || layout.swap.build.length === 0) return;

  if (Game.time % 100 !== 0) return;

  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const sitesPerRun = 5;
  let sitesCreated = 0;

  for (const entry of layout.swap.build) {
    const existingSite = sites.find(s => 
      s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
    );
    if (existingSite) continue;

    const existingStructure = room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y)
      .find(s => s.structureType === entry.structureType);
    if (existingStructure) continue;

    const result = room.createConstructionSite(entry.pos, entry.structureType);
    if (result === OK) {
      sitesCreated++;
      if (sitesCreated >= sitesPerRun) break;
    }
  }
}

const MAX_ROADS_PER_TICK = 5;

function drainPendingRoads(room: Room): void {
  const ns = Memory[CURRENT_NS];
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

function recheckLayout(room: Room): void {
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

export const loop = (): void => {
  if (Memory.v1 && !Memory[CURRENT_NS]) {
    Memory[CURRENT_NS] = Memory.v1;
    delete Memory.v1;
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

    // Queen evaluates colony needs and submits spawn requests
    queenTick(room);

    // Track energy for cashflow
    const prevTotal = (Memory.v1 as any)._prevTotalEnergy?.[roomName] ?? -1;
    const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
    if (prevTotal >= 0) {
      trackIncome(roomName, currentTotal, prevTotal);
    }
    if (!(Memory.v1 as any)._prevTotalEnergy) (Memory.v1 as any)._prevTotalEnergy = {};
    (Memory.v1 as any)._prevTotalEnergy[roomName] = currentTotal;

    // Terrain and layout planning
    getTerrainMatrix(room.name);
    if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
      const health = getHealth(room);
      if (health !== 'red' || !room.memory.layout) {
        const layout = planLayout(room);
        const swapPlan = planSwap(room, layout);
        room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
      }
    }

    createConstructionSites(room);
    drainPendingRoads(room);
    recheckLayout(room);

    // Event-driven watchers (cheap per-tick checks)
    hostileWatcher(room);
    expansionWatcher(room);

    // Hatchery processes queue and spawns highest priority request
    hatcheryProcess(room);

    // Run creeps with CPU budget gating
    runCreeps(room);

    // Track construction progress
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    let progressDelta = 0;
    for (const site of sites) {
      const prev = (Memory.v1 as any)._prevProgress?.[site.id] || site.progress;
      progressDelta += Math.max(0, site.progress - prev);
      if (!(Memory.v1 as any)._prevProgress) (Memory.v1 as any)._prevProgress = {};
      (Memory.v1 as any)._prevProgress[site.id] = site.progress;
    }
    if (progressDelta > 0) {
      trackBuild(roomName, progressDelta);
    }

    HUD.run(room);
  }
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: tiered CPU dispatch, event watchers, task-based role integration"
```

---

### Task 10: Update HUD labels

**Files:**
- Modify: `src/lib/HUD.ts`

- [ ] **Step 1: Update HUD.ts**

Remove Goal import (no longer exists). Update creep labels to show current task type.

Replace the `drawCreepLabels` function:

```typescript
function drawCreepLabels(vis: RoomVisual, creep: Creep): void {
  let label = '';
  let color = '#ffffff';
  const task = creep.memory.task;

  const taskLabel = task ? task.type.slice(0, 4).toUpperCase() : 'IDLE';

  switch (creep.memory.role) {
    case 'harvester':
      label = '[H:' + taskLabel + ']';
      color = '#4caf50';
      break;
    case 'hauler':
      label = '[HAUL:' + taskLabel + ']';
      color = '#00bcd4';
      break;
    case 'builder':
      label = '[BLD:' + taskLabel + ']';
      color = '#ffeb3b';
      break;
    case 'upgrader':
      label = '[UP:' + taskLabel + ']';
      color = '#9c27b0';
      break;
  }

  if (label) {
    vis.text(label, creep.pos.x, creep.pos.y - 0.5, {
      font: '5px monospace',
      color: color,
      stroke: '#000000',
      strokeWidth: 0.15,
    });
  }
}
```

Also remove the Goal reference from HUD — remove the `import { Goal }` line (it won't exist anymore, but the direct `room.memory.goal` usage should already be gone since we removed it from the type). Check that `room.memory.goal` isn't referenced anywhere else in HUD.ts (it wasn't in the original).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/HUD.ts
git commit -m "refactor: HUD shows task type instead of goal icon"
```