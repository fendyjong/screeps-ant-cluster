# Colony Layout Implementation Plan

> **For agentic workers:** This plan is executed directly. Tasks use checkbox (`- [ ] `) syntax.

**Goal:** Replace BFS-based anchor/barrier generation with distance transform + min-cut, and add staggered lifecycle management.

**Architecture:** Three new files (`AnchorPlanner.ts`, `BarrierPlanner.ts`, `Lifecycle.ts`) split from `Architect.ts`. `planLayout` integrates anchor and barrier output. `main.ts` calls lifecycle instead of `createConstructionSites`.

**Tech Stack:** TypeScript, Screeps globals (PathFinder, CostMatrix, RoomPosition)

---

### Task 1: Create src/colony/AnchorPlanner.ts

**Files:**
- Create: `src/colony/AnchorPlanner.ts`

- [ ] **Step 1: Write AnchorPlanner.ts**

```typescript
import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';
import { findPath } from '../lib/PathFinder';

const BUNKER_RADIUS = 6;

export function findBestAnchor(room: Room): RoomPosition {
	const roomName = room.name;
	const matrix = getTerrainMatrix(roomName);

	// BFS distance transform: compute distance from each tile to nearest wall
	const dist = new Array(50).fill(0).map(() => new Array(50).fill(0));
	const queue: { x: number; y: number }[] = [];

	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			if (!isWalkable(matrix, x, y) || x === 0 || y === 0 || x === 49 || y === 49) {
				dist[y][x] = 0;
				queue.push({ x, y });
			} else {
				dist[y][x] = Infinity;
			}
		}
	}

	let head = 0;
	while (head < queue.length) {
		const cur = queue[head++];
		const d = dist[cur.y][cur.x] + 1;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const nx = cur.x + dx;
				const ny = cur.y + dy;
				if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
				if (d < dist[ny][nx]) {
					dist[ny][nx] = d;
					queue.push({ x: nx, y: ny });
				}
			}
		}
	}

	// Find candidates where bunker fits (radius + 1 margin)
	const candidates: RoomPosition[] = [];
	const margin = BUNKER_RADIUS + 1;
	for (let y = margin; y < 50 - margin; y++) {
		for (let x = margin; x < 50 - margin; x++) {
			if (dist[y][x] >= BUNKER_RADIUS + 1) {
				candidates.push(new RoomPosition(x, y, roomName));
			}
		}
	}

	if (candidates.length === 0) {
		// Fallback: best available
		let best = 0;
		let bestPos = new RoomPosition(25, 25, roomName);
		for (let y = 0; y < 50; y++) {
			for (let x = 0; x < 50; x++) {
				if (dist[y][x] > best) {
					best = dist[y][x];
					bestPos = new RoomPosition(x, y, roomName);
				}
			}
		}
		return bestPos;
	}

	// Sample if too many candidates
	const sample = candidates.length > 20
		? candidates.sort(() => Math.random() - 0.5).slice(0, 20)
		: candidates;

	// Score each: sum of path lengths to sources + controller
	const goals: RoomPosition[] = [];
	if (room.controller) goals.push(room.controller.pos);
	for (const source of room.find(FIND_SOURCES)) {
		goals.push(source.pos);
	}

	let bestScore = Infinity;
	let bestAnchor = sample[0];

	for (const anchor of sample) {
		let score = 0;
		for (const goal of goals) {
			const ret = findPath(anchor, goal, { maxRooms: 1, maxOps: 5000, terrainCosts: { plainCost: 1, swampCost: 1 } });
			if (!ret.incomplete) {
				score += ret.path.length;
			} else {
				score += 1000; // penalty for no path
			}
		}
		if (score < bestScore) {
			bestScore = score;
			bestAnchor = anchor;
		}
	}

	return bestAnchor;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/colony/AnchorPlanner.ts
git commit -m "feat: add distance-transform anchor planner"
```

---

### Task 2: Create src/colony/BarrierPlanner.ts

**Files:**
- Create: `src/colony/BarrierPlanner.ts`

- [ ] **Step 1: Write BarrierPlanner.ts — Dinic's max-flow + min-cut wrapper**

```typescript
import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';

const BUNKER_RADIUS = 6;

// Dinic's max-flow on a grid graph
class Dinic {
	private graph: { to: number; rev: number; cap: number }[][];
	private level: number[];
	private it: number[];

	constructor(n: number) {
		this.graph = new Array(n).fill(0).map(() => []);
		this.level = new Array(n).fill(0);
		this.it = new Array(n).fill(0);
	}

	addEdge(from: number, to: number, cap: number): void {
		this.graph[from].push({ to, rev: this.graph[to].length, cap });
		this.graph[to].push({ to: from, rev: this.graph[from].length - 1, cap: 0 });
	}

	private bfs(s: number, t: number): boolean {
		this.level.fill(-1);
		const q: number[] = [s];
		this.level[s] = 0;
		while (q.length > 0) {
			const v = q.shift()!;
			for (const e of this.graph[v]) {
				if (e.cap > 0 && this.level[e.to] < 0) {
					this.level[e.to] = this.level[v] + 1;
					q.push(e.to);
				}
			}
		}
		return this.level[t] >= 0;
	}

	private dfs(v: number, t: number, f: number): number {
		if (v === t) return f;
		for (let i = this.it[v]; i < this.graph[v].length; i++) {
			const e = this.graph[v][i];
			if (e.cap > 0 && this.level[v] < this.level[e.to]) {
				const d = this.dfs(e.to, t, Math.min(f, e.cap));
				if (d > 0) {
					e.cap -= d;
					this.graph[e.to][e.rev].cap += d;
					return d;
				}
			}
			this.it[v]++;
		}
		return 0;
	}

	maxFlow(s: number, t: number): number {
		let flow = 0;
		const INF = 1e9;
		while (this.bfs(s, t)) {
			this.it.fill(0);
			while (true) {
				const f = this.dfs(s, t, INF);
				if (f === 0) break;
				flow += f;
			}
		}
		return flow;
	}

	// After maxFlow, find nodes reachable from source in residual graph
	reachableFromSource(s: number): boolean[] {
		const visited = new Array(this.graph.length).fill(false);
		const q: number[] = [s];
		visited[s] = true;
		while (q.length > 0) {
			const v = q.shift()!;
			for (const e of this.graph[v]) {
				if (e.cap > 0 && !visited[e.to]) {
					visited[e.to] = true;
					q.push(e.to);
				}
			}
		}
		return visited;
	}
}

function nodeId(x: number, y: number): number {
	return y * 50 + x;
}

export function computeBarriers(room: Room, anchor: RoomPosition): RoomPosition[] {
	const roomName = room.name;
	const matrix = getTerrainMatrix(roomName);

	// Zone: only compute within bunker radius + margin
	const margin = 3;
	const x1 = Math.max(anchor.x - BUNKER_RADIUS - margin, 0);
	const x2 = Math.min(anchor.x + BUNKER_RADIUS + margin, 49);
	const y1 = Math.max(anchor.y - BUNKER_RADIUS - margin, 0);
	const y2 = Math.min(anchor.y + BUNKER_RADIUS + margin, 49);

	const zoneWidth = x2 - x1 + 1;
	const zoneHeight = y2 - y1 + 1;
	const totalNodes = zoneWidth * zoneHeight + 2;
	const SRC = totalNodes - 2;
	const SNK = totalNodes - 1;

	function zoneNodeId(x: number, y: number): number {
		return (y - y1) * zoneWidth + (x - x1);
	}

	const dinic = new Dinic(totalNodes);

	// Interior zone: tiles within bunker radius of anchor
	const interiorRadius = BUNKER_RADIUS - 1;

	for (let y = y1; y <= y2; y++) {
		for (let x = x1; x <= x2; x++) {
			const id = zoneNodeId(x, y);
			const walkable = isWalkable(matrix, x, y);
			const dist = Math.sqrt((x - anchor.x) ** 2 + (y - anchor.y) ** 2);
			const isInterior = dist <= interiorRadius;

			if (isInterior) {
				// Interior tile: connect to source with infinite capacity
				dinic.addEdge(SRC, id, 1e9);
			}

			// Connect to adjacent tiles
			if (x < x2) {
				const rightId = zoneNodeId(x + 1, y);
				if (walkable && isWalkable(matrix, x + 1, y)) {
					dinic.addEdge(id, rightId, 1);
					dinic.addEdge(rightId, id, 1);
				}
			}
			if (y < y2) {
				const downId = zoneNodeId(x, y + 1);
				if (walkable && isWalkable(matrix, x, y + 1)) {
					dinic.addEdge(id, downId, 1);
					dinic.addEdge(downId, id, 1);
				}
			}

			// Exterior tiles (room edge or non-walkable)
			const isEdge = x === 0 || y === 0 || x === 49 || y === 49;
			if (isEdge || !walkable) {
				dinic.addEdge(id, SNK, 1e9);
			}
		}
	}

	dinic.maxFlow(SRC, SNK);
	const reachable = dinic.reachableFromSource(SRC);

	// Cut tiles: reachable from source but adjacent to unreachable
	const barriers: RoomPosition[] = [];
	for (let y = y1; y <= y2; y++) {
		for (let x = x1; x <= x2; x++) {
			const id = zoneNodeId(x, y);
			if (!reachable[id]) continue;
			// Check if any neighbor is NOT reachable → this is a cut tile
			const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
			for (const [dx, dy] of dirs) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < x1 || nx > x2 || ny < y1 || ny > y2) {
					barriers.push(new RoomPosition(x, y, roomName));
					break;
				}
				const nid = zoneNodeId(nx, ny);
				if (!reachable[nid]) {
					barriers.push(new RoomPosition(x, y, roomName));
					break;
				}
			}
		}
	}

	// Force barriers under critical structures
	const structures = room.find(FIND_MY_STRUCTURES, {
		filter: s => s.structureType === STRUCTURE_SPAWN
			|| s.structureType === STRUCTURE_STORAGE
			|| s.structureType === STRUCTURE_TERMINAL
			|| s.structureType === STRUCTURE_TOWER
	});
	for (const s of structures) {
		if (!barriers.some(b => b.isEqualTo(s.pos))) {
			barriers.push(s.pos);
		}
	}

	return barriers;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/colony/BarrierPlanner.ts
git commit -m "feat: add min-cut barrier planner with Dinic's algorithm"
```

---

### Task 3: Create src/colony/Lifecycle.ts

**Files:**
- Create: `src/colony/Lifecycle.ts`

- [ ] **Step 1: Write Lifecycle.ts**

```typescript
import { getBudget } from './Cashflow';

const ENERGY_BUDGET = 'construction';

export function shouldRecheck(room: Room, offset = 0): boolean {
	const rcl = room.controller?.level || 1;
	const interval = Math.max(5, Math.floor(100 / (rcl + 1)));
	const hash = Math.abs(room.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
	return Game.time % interval === (hash + offset) % interval;
}

export function demolishMisplaced(room: Room, plan: { destroy: string[]; build: { pos: RoomPosition; structureType: string }[]; state: string }): void {
	const rcl = room.controller?.level || 1;
	const toRemove: number[] = [];
	const maxPerTick = 5;
	let count = 0;

	for (let i = 0; i < plan.destroy.length && count < maxPerTick; i++) {
		const id = plan.destroy[i];
		const structure = Game.getObjectById(id) as Structure | null;
		if (!structure) {
			toRemove.push(i);
			continue;
		}

		const type = structure.structureType;

		// Safety checks
		if (type === STRUCTURE_SPAWN) {
			const otherSpawns = room.find(FIND_MY_STRUCTURES, {
				filter: s => s.structureType === STRUCTURE_SPAWN && s.id !== id
			});
			if (otherSpawns.length === 0) {
				const budget = getBudget(room, ENERGY_BUDGET);
				if (budget < 15000) continue;
				// Check worker capacity: total WORK parts * TTL across all builder creeps
				let workerCapacity = 0;
				for (const name in Game.creeps) {
					const c = Game.creeps[name];
					if (c.memory.role === 'builder' && c.memory.roomName === room.name) {
						workerCapacity += c.getActiveBodyparts(WORK) * (c.ticksToLive || 0);
					}
				}
				if (workerCapacity < 15000) continue;
			}
		}

		if (type === STRUCTURE_STORAGE) {
			if (rcl < 4) continue;
			const hasReplacement = plan.build.some(
				e => e.structureType === STRUCTURE_STORAGE
			);
			if (!hasReplacement) continue;
		}

		if (type === STRUCTURE_TERMINAL) {
			if (rcl < 4) continue;
			const storage = room.storage;
			if (!storage) continue;
			const nonEnergy = Object.keys(storage.store).filter(r => r !== RESOURCE_ENERGY);
			if (nonEnergy.some(r => (storage.store[r] || 0) > 1000)) continue;
		}

		if (type === STRUCTURE_RAMPART) {
			continue; // let ramparts decay naturally
		}

		const result = structure.destroy();
		if (result === OK) {
			count++;
			toRemove.push(i);
		}
	}

	// Remove demolished entries (reverse order)
	for (let i = toRemove.length - 1; i >= 0; i--) {
		plan.destroy.splice(toRemove[i], 1);
	}
	if (count > 0) plan.state = 'destroying';
}

export function buildMissing(room: Room, plan: { destroy: string[]; build: { pos: RoomPosition; structureType: string }[]; state: string }): void {
	const rcl = room.controller?.level || 1;
	const maxPerTick = Math.min(25, 5 + rcl * 2);
	const existingSites = room.find(FIND_MY_CONSTRUCTION_SITES);
	const toRemove: number[] = [];
	let count = 0;

	for (let i = 0; i < plan.build.length && count < maxPerTick; i++) {
		const entry = plan.build[i];

		// Skip if already has a site or structure at this position
		if (existingSites.some(s => s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType)) continue;
		if (room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y).some(s => s.structureType === entry.structureType)) {
			toRemove.push(i);
			continue;
		}

		const result = room.createConstructionSite(entry.pos, entry.structureType);
		if (result === OK) {
			count++;
			toRemove.push(i);
		} else if (result === ERR_INVALID_TARGET) {
			toRemove.push(i); // can't build here, remove from plan
		}
	}

	for (let i = toRemove.length - 1; i >= 0; i--) {
		plan.build.splice(toRemove[i], 1);
	}
	if (count > 0) plan.state = 'building';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/colony/Lifecycle.ts
git commit -m "feat: add structure lifecycle (demolish/build with safety checks)"
```

---

### Task 4: Update Architect.ts

**Files:**
- Modify: `src/colony/Architect.ts`

- [ ] **Step 1: Replace findSpawnPosition with findBestAnchor, remove computeRampartPositions and computeWallPositions, integrate BarrierPlanner**

Add imports at top:
```typescript
import { findBestAnchor } from './AnchorPlanner';
import { computeBarriers } from './BarrierPlanner';
```

Remove these functions:
- `findSpawnPosition(roomName)` — fully replaced by `findBestAnchor(room)`
- `computeRampartPositions(core, labs, extensions)` — replaced by BarrierPlanner
- `computeWallPositions(room, matrix, allStructureKeys)` — replaced by BarrierPlanner

Update `planLayout` function signature and body:
```typescript
export function planLayout(room: Room): BunkerLayout {
	const matrix = getTerrainMatrix(room.name);
	const anchor = findBestAnchor(room);

	// Phase 1: Core zone
	const core = carveCoreZone(room, anchor, matrix);
	// ... (rest of carveCoreZone, carveLabZone, carveExtensions, placeTowers unchanged)

	// Phase 5: Barriers — replaced by min-cut
	core.ramparts = computeBarriers(room, core.anchor);
	core.walls = []; // walls deprecated, min-cut ramparts are sufficient

	// Phase 6: Roads (unchanged)
	core.roads = computeRoadPositions(room, matrix, core, extensions);
	// ... (rest of planLayout unchanged)
}
```

Remove `isWalkablePos` if no longer referenced (it was only used by `computeRampartPositions`). Check: `computeRoadPositions` doesn't use it, `carveCoreZone` uses `getAdjacentWalkable`. Actually `isWalkablePos` is used in `planSwap` for link positions:
```typescript
const linkPositions = [layout.linkSpawn, layout.linkController, layout.linkLab].filter(isWalkablePos);
```
So keep `isWalkablePos`.

- [ ] **Step 2: Commit**

```bash
git add src/colony/Architect.ts
git commit -m "refactor: integrate anchor planner and barrier planner, remove old functions"
```

---

### Task 5: Update main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace createConstructionSites + drainPendingRoads with lifecycle calls**

Add import:
```typescript
import { shouldRecheck, demolishMisplaced, buildMissing } from './colony/Lifecycle';
```

Replace the section in `loop()` where `createConstructionSites(room)` and `drainPendingRoads(room)` are called:

```typescript
// Old:
createConstructionSites(room);
drainPendingRoads(room);
recheckLayout(room);

// New:
if (room.memory.layout && room.memory.layout.swap) {
	if (shouldRecheck(room)) {
		demolishMisplaced(room, room.memory.layout.swap);
	} else if (shouldRecheck(room, 1)) {
		buildMissing(room, room.memory.layout.swap);
	}
}
drainPendingRoads(room);
recheckLayout(room);
```

Remove the `createConstructionSites` function definition (lines 58-94) and the `STRUCTURE_COSTS` constant (lines 39-56) since they're no longer referenced.

- [ ] **Step 2: Commit**

```bash
git add src/main.ts
git commit -m "refactor: replace createConstructionSites with lifecycle cycle"
```

---

### Task 6: Build and verify

**Files:**
- Build: entire project

- [ ] **Step 1: Run build**

```bash
npx rollup -c rollup.config.mjs
```

Expected output: `created screeps.com/default/main.js, 127_0_0_1___21025/default/main.js in 1s`

Fix any TypeScript errors:
- Missing imports: ensure `findBestAnchor`, `computeBarriers`, `shouldRecheck`, `demolishMisplaced`, `buildMissing` imports are correct
- Type errors: `plan.destroy` is `string[]`, `plan.build` is `{pos: RoomPosition; structureType: string}[]`, `plan.state` is `string`
- `getBudget` import in Lifecycle.ts: ensure path `'./Cashflow'` is correct (relative to `src/colony/`)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: colony layout system with anchor planning, barrier planning, and lifecycle"
```