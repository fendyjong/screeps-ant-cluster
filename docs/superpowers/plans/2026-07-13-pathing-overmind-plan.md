# Pathing Overmind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace current `creep.moveTo()` wrapper with direct `PathFinder.search()`, path caching, body-aware costs, and creep pushing.

**Architecture:** 3 files replacing current `Pathing.ts` + trimmed `TerrainMatrix.ts`. `src/lib/PathFinder.ts` handles cost matrices and pathfinding. `src/lib/Pathing.ts` provides the `moveTo()` public API with cached direction-string paths and priority creep pushing. `src/lib/helpers.ts` has terrain cost and coord utilities.

**Tech Stack:** TypeScript, Screeps globals (PathFinder, CostMatrix, Game.map.findRoute)

---

### Task 1: Create src/lib/helpers.ts

**Files:**
- Create: `src/lib/helpers.ts`

- [ ] **Step 1: Write helpers.ts**

```typescript
import { hasPos } from 'screeps';

export function normalizePos(destination: HasPos | RoomPosition): RoomPosition {
	if (hasPos(destination)) {
		return destination.pos;
	}
	return destination;
}

export function isExit(pos: Coord): boolean {
	return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
}

export function sameCoord(pos1: Coord, pos2: Coord): boolean {
	return pos1.x === pos2.x && pos1.y === pos2.y;
}

export function getTerrainCosts(creep: Creep): { plainCost: number; swampCost: number } {
	let weighted = 0;
	let moveParts = 0;
	for (const part of creep.body) {
		switch (part.type) {
			case MOVE:
				moveParts++;
				break;
			case CARRY:
				break; // weighted only by carry content
			default:
				weighted++;
		}
	}

	if (moveParts === 0) moveParts = 1;

	const carryUsed = creep.store.getUsedCapacity();
	weighted += Math.ceil(carryUsed / CARRY_CAPACITY);

	const ratio = Math.ceil(weighted / moveParts);
	return {
		plainCost: Math.max(ratio, 1),
		swampCost: Math.max(ratio * 5, 5),
	};
}
```

---

### Task 2: Create src/lib/PathFinder.ts

**Files:**
- Create: `src/lib/PathFinder.ts`

- [ ] **Step 1: Write PathFinder.ts — terrain matrix + isWalkable**

```typescript
import { CostMatrix } from 'screeps';
import { CURRENT_NS } from './Memory';

export const TERRAIN_VERSION = 1;
const TERRAIN_COSTS = { plain: 2, swamp: 10, wall: 255 };

export function isWalkable(matrix: CostMatrix, x: number, y: number): boolean {
	if (x < 0 || x > 49 || y < 0 || y > 49) return false;
	return matrix.get(x, y) < 255;
}

export function getTerrainMatrix(roomName: string): CostMatrix {
	const ns = Memory[CURRENT_NS];
	if (!ns) { (Memory as any)[CURRENT_NS] = {}; }
	if (!ns.pathing) ns.pathing = {};
	if (!ns.pathing.terrain) ns.pathing.terrain = {};

	const cached = ns.pathing.terrain[roomName];
	if (cached && cached.version === TERRAIN_VERSION) {
		return PathFinder.CostMatrix.deserialize(cached.matrix);
	}

	const matrix = new PathFinder.CostMatrix();
	const terrain = Game.map.getRoomTerrain(roomName);
	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			const t = terrain.get(x, y);
			if (t === TERRAIN_MASK_WALL) {
				matrix.set(x, y, TERRAIN_COSTS.wall);
			} else if (t === TERRAIN_MASK_SWAMP) {
				matrix.set(x, y, TERRAIN_COSTS.swamp);
			} else {
				matrix.set(x, y, TERRAIN_COSTS.plain);
			}
		}
	}

	ns.pathing.terrain[roomName] = {
		matrix: matrix.serialize(),
		tick: Game.time,
		version: TERRAIN_VERSION,
	};
	return matrix;
}
```

- [ ] **Step 2: Add computeStructSig + getStructureMatrix**

```typescript
export function computeStructSig(room: Room): number {
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

function blockExits(matrix: CostMatrix): void {
	for (let x = 0; x < 50; x++) {
		matrix.set(x, 0, 255);
		matrix.set(x, 49, 255);
	}
	for (let y = 0; y < 50; y++) {
		matrix.set(0, y, 255);
		matrix.set(49, y, 255);
	}
}

function getStructureMatrix(room: Room): CostMatrix {
	const ns = Memory[CURRENT_NS];
	if (!ns.pathing) ns.pathing = {};
	if (!ns.pathing.structureCache) ns.pathing.structureCache = {};

	const currentSig = computeStructSig(room);
	const cached = ns.pathing.structureCache[room.name] as { matrix: number[]; structSig: number } | undefined;

	if (cached && cached.structSig === currentSig) {
		return PathFinder.CostMatrix.deserialize(cached.matrix);
	}

	const matrix = getTerrainMatrix(room.name);
	const costs = new PathFinder.CostMatrix();
	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			costs.set(x, y, matrix.get(x, y));
		}
	}

	const structures = room.find(FIND_STRUCTURES);
	for (let i = 0; i < structures.length; i++) {
		const s = structures[i];
		if (s.structureType === STRUCTURE_ROAD) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (s.structureType === STRUCTURE_CONTAINER) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (s.structureType === STRUCTURE_RAMPART && s.my) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (!(s as any).isWalkable) {
			costs.set(s.pos.x, s.pos.y, 255);
		}
	}

	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (let i = 0; i < sites.length; i++) {
		const site = sites[i];
		if (!(site as any).isWalkable) {
			costs.set(site.pos.x, site.pos.y, 255);
		}
	}

	ns.pathing.structureCache[room.name] = {
		matrix: costs.serialize(),
		structSig: currentSig,
	};
	return costs;
}
```

- [ ] **Step 3: Add findRoute + findPath**

```typescript
export interface MoveOpts {
	maxRooms?: number;
	preferHighway?: boolean;
	avoidHostile?: boolean;
	ignoreCreeps?: boolean;
	range?: number;
	maxOps?: number;
	repath?: number;
	terrainCosts?: { plainCost: number; swampCost: number };
}

export function findRoute(
	origin: string,
	destination: string,
	opts: MoveOpts = {}
): { [roomName: string]: boolean } | undefined {
	const highwayBias = opts.preferHighway ? 2.5 : 1;
	const restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 10;

	const ret = (Game.map as any).findRoute(origin, destination, {
		routeCallback: (roomName: string) => {
			const range = Game.map.getRoomLinearDistance(origin, roomName);
			if (range > restrictDistance) return Number.POSITIVE_INFINITY;

			if (opts.avoidHostile !== false) {
				const mem = Memory.rooms?.[roomName];
				if (mem && (mem as any).avoid && roomName !== destination && roomName !== origin) {
					return Number.POSITIVE_INFINITY;
				}
			}
			return highwayBias;
		},
	});

	if (!Array.isArray(ret)) return undefined;

	const allowedRooms: { [roomName: string]: boolean } = { [origin]: true, [destination]: true };
	for (const value of ret) {
		allowedRooms[(value as any).room] = true;
	}
	return allowedRooms;
}

export function findPath(
	origin: RoomPosition,
	destination: RoomPosition,
	opts: MoveOpts = {}
): PathFinderPath {
	const defaults: MoveOpts = {
		ignoreCreeps: true,
		maxOps: 20000,
		range: 1,
		terrainCosts: { plainCost: 2, swampCost: 10 },
	};
	const options = { ...defaults, ...opts };

	const roomDistance = Game.map.getRoomLinearDistance(origin.roomName, destination.roomName);
	const useRoute = options.maxRooms !== 1 && (roomDistance > 2 || (options.maxRooms && options.maxRooms > 1));
	const allowedRooms = useRoute ? findRoute(origin.roomName, destination.roomName, options) : undefined;

	const roomCallback = (roomName: string): CostMatrix | boolean => {
		if (allowedRooms && !allowedRooms[roomName]) return false;

		if (options.avoidHostile !== false) {
			const mem = Memory.rooms?.[roomName];
			if (mem && (mem as any).avoid && roomName !== origin.roomName && roomName !== destination.roomName) {
				return false;
			}
		}

		const room = Game.rooms[roomName];
		if (room) {
			return getStructureMatrix(room);
		}
		return true;
	};

	return PathFinder.search(origin, { pos: destination, range: options.range! }, {
		maxOps: options.maxOps,
		maxRooms: options.maxRooms,
		plainCost: options.terrainCosts!.plainCost,
		swampCost: options.terrainCosts!.swampCost,
		roomCallback,
	});
}
```

---

### Task 3: Rewrite src/lib/Pathing.ts

**Files:**
- Modify: `src/lib/Pathing.ts` (full rewrite)

- [ ] **Step 1: Write new Pathing.ts — move priorities + serialization**

```typescript
import { findPath, MoveOpts, getStructureMatrix } from './PathFinder';
import { getTerrainCosts, normalizePos, isExit, sameCoord } from './helpers';

const MOVE_PRIORITY: Record<string, number> = {
	harvester: 1,
	defender: 2,
	hauler: 3,
	builder: 4,
	upgrader: 5,
	scout: 9,
};

const DEFAULT_PRIORITY = 10;
const STUCK_THRESHOLD = 2;

export interface MoveOpts {
	maxRooms?: number;
	preferHighway?: boolean;
	avoidHostile?: boolean;
	ignoreCreeps?: boolean;
	range?: number;
	maxOps?: number;
	repath?: number;
}

function serializePath(startPos: RoomPosition, path: RoomPosition[]): string {
	let result = '';
	let last = startPos;
	for (const pos of path) {
		if (pos.roomName === last.roomName) {
			result += last.getDirectionTo(pos);
		}
		last = pos;
	}
	return result;
}

function isStuck(creep: Creep): boolean {
	const last = creep.memory._lastPos as { x: number; y: number; roomName: string } | undefined;
	if (!last) {
		creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
		return false;
	}
	if (creep.pos.x === last.x && creep.pos.y === last.y && creep.room.name === last.roomName) {
		creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
	} else {
		creep.memory._stuckTicks = 0;
	}
	creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
	return (creep.memory._stuckTicks || 0) > STUCK_THRESHOLD;
}
```

- [ ] **Step 2: Add creep push logic**

```typescript
const DIR_OFFSETS: Record<number, { dx: number; dy: number }> = {
	1: { dx: 0, dy: -1 },
	2: { dx: 1, dy: -1 },
	3: { dx: 1, dy: 0 },
	4: { dx: 1, dy: 1 },
	5: { dx: 0, dy: 1 },
	6: { dx: -1, dy: 1 },
	7: { dx: -1, dy: 0 },
	8: { dx: -1, dy: -1 },
};

function oppositeDir(dir: DirectionConstant): DirectionConstant {
	return ((dir + 3) % 8 + 1) as DirectionConstant;
}

function getPushPriority(creep: Creep): number {
	return MOVE_PRIORITY[creep.memory.role] ?? DEFAULT_PRIORITY;
}

function tryPush(creep: Creep, dir: DirectionConstant): boolean {
	const offset = DIR_OFFSETS[dir];
	if (!offset) return false;
	const x = creep.pos.x + offset.dx;
	const y = creep.pos.y + offset.dy;
	if (x < 0 || x > 49 || y < 0 || y > 49) return false;

	const blocking = creep.room.lookForAt(LOOK_CREEPS, x, y)[0];
	if (!blocking) return true; // no creep to push, caller should proceed

	if (getPushPriority(creep) >= getPushPriority(blocking)) return false; // can't push higher priority

	// Find a free neighbor for the pushed creep
	const dirs: DirectionConstant[] = [1, 2, 3, 4, 5, 6, 7, 8];
	for (const d of dirs) {
		const off = DIR_OFFSETS[d];
		const nx = blocking.pos.x + off.dx;
		const ny = blocking.pos.y + off.dy;
		if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
		const terrain = blocking.room.lookForAt(LOOK_TERRAIN, nx, ny)[0];
		if (terrain === 'wall') continue;
		if (blocking.room.lookForAt(LOOK_CREEPS, nx, ny).length > 0) continue;
		if (blocking.room.lookForAt(LOOK_STRUCTURES, nx, ny).some(s => !(s as any).isWalkable)) continue;

		const result = blocking.move(d);
		if (result === OK) {
			// Prepend opposite direction to pushed creep's path so it can resume
			if (blocking.memory._path) {
				blocking.memory._path = oppositeDir(d) + blocking.memory._path;
			}
			return true;
		}
	}
	return false;
}
```

- [ ] **Step 3: Write moveTo export**

```typescript
export function moveTo(creep: Creep, target: HasPos | RoomPosition, opts?: MoveOpts): ScreepsReturnCode {
	if (creep.fatigue > 0) return ERR_TIRED;
	if (creep.spawning) return ERR_BUSY;

	const dest = normalizePos(target);
	const range = opts?.range ?? 1;
	const rangeTo = creep.pos.getRangeTo(dest);

	if (rangeTo <= range) return ERR_NOT_IN_RANGE; // arrived

	// Initialize path memory
	if (!creep.memory._path) creep.memory._path = '';
	if (!creep.memory._stuckTicks) creep.memory._stuckTicks = 0;

	const stuck = isStuck(creep);
	if (stuck && Math.random() > 0.5) {
		creep.memory._path = ''; // force repath
	}

	// Re-path if needed
	if (!creep.memory._path || creep.memory._path.length === 0) {
		const terrainCosts = getTerrainCosts(creep);
		const ret = findPath(creep.pos, dest, {
			...opts,
			terrainCosts,
			ignoreCreeps: true,
		});

		if (ret.incomplete) return ERR_NO_PATH;

		creep.memory._path = serializePath(creep.pos, ret.path);
	}

	if (!creep.memory._path || creep.memory._path.length === 0) return ERR_NO_PATH;

	const dir = parseInt(creep.memory._path[0], 10) as DirectionConstant;

	// Try to push blocking creep
	if (!tryPush(creep, dir)) {
		// blocked by higher priority creep - don't move, try again next tick
		return ERR_BUSY;
	}

	const result = creep.move(dir);
	if (result === OK) {
		creep.memory._path = creep.memory._path.slice(1);
	}
	return result;
}
```

---

### Task 4: Update src/lib/TerrainMatrix.ts

**Files:**
- Modify: `src/lib/TerrainMatrix.ts`

- [ ] **Step 1: Remove terrain generation, import from PathFinder**

Remove these functions:
- `generateTerrainMatrix()`
- `getTerrainMatrix()`  
- `ensurePathingMemory()`
- `isWalkable()`
- `TERRAIN_COSTS`, `TERRAIN_VERSION`

Add import at top:
```typescript
import { getTerrainMatrix, isWalkable } from './PathFinder';
```

Keep these:
- `findWalkablePositions(roomName)` — unchanged
- `findChokepoints(roomName)` — unchanged
- `findPerimeterPositions(roomName)` — unchanged
- `calculateCoverage(pos, range, roomName)` — unchanged
- `findOptimalTowerPositions(roomName, count)` — unchanged

Remove `ensureMemoryNs` import if no longer needed — but `findWalkablePositions` calls `getTerrainMatrix` which handles its own memory, so the import is safe. Actually remove the unused import of `ensureMemoryNs`.

- [ ] **Step 2: Clean up imports**

Old imports:
```typescript
import { CostMatrix } from 'screeps';
import { ensureMemoryNs, CURRENT_NS } from './Memory';
```

New imports:
```typescript
import { getTerrainMatrix, isWalkable } from './PathFinder';
```

The individual functions (findWalkablePositions etc.) don't import `CostMatrix` directly — they use `getTerrainMatrix` which returns one. Remove unused imports.

---

### Task 5: Update Architect.ts imports

**Files:**
- Modify: `src/colony/Architect.ts`

- [ ] **Step 1: Update import line**

```typescript
// Old:
import { getTerrainMatrix, isWalkable, findOptimalTowerPositions } from '../lib/TerrainMatrix';
// New:
import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';
import { findOptimalTowerPositions } from '../lib/TerrainMatrix';
```

No other changes needed in Architect.ts.

---

### Task 6: Update main.ts imports

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update TerrainMatrix import**

```typescript
// Old:
import { getTerrainMatrix } from './lib/TerrainMatrix';
// New:
import { getTerrainMatrix } from './lib/PathFinder';
```

---

### Task 7: Build and verify

**Files:**
- Build: entire project

- [ ] **Step 1: Run build**

```bash
npx rollup -c rollup.config.mjs
```

Expected output: `created screeps.com/default/main.js, 127_0_0_1___21025/default/main.js in 1s`

Fix any TypeScript errors in the output.

- [ ] **Step 2: Commit**

```bash
git add src/lib/helpers.ts src/lib/PathFinder.ts src/lib/Pathing.ts src/lib/TerrainMatrix.ts src/colony/Architect.ts src/main.ts docs/superpowers/specs/2026-07-13-pathing-overmind-design.md
git commit -m "feat: rewrite pathing with PathFinder, path caching, body costs, creep pushing"
```
