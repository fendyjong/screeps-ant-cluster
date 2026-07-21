# Dynamic Zone Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a terrain-first dynamic planner foundation that can score room terrain and produce a `StructureMap` candidate without changing live room behavior.

**Architecture:** Create `src/roomPlanner/DynamicPlanner.ts` as an isolated planner module. It reads room terrain, generates core candidates near the source/controller centroid, scores candidates by logistics, min-cut defense, build capacity, and terrain penalties, then returns a `DynamicPlanCandidate` containing a partial structure map compatible with existing `RoomPlanner` types.

**Tech Stack:** TypeScript Screeps bot, Screeps `Room`, `RoomPosition`, `CostMatrix`, lodash globals, existing `Pathing`, `getCutTiles`, and `StructureMap` types. Verification uses `npm run build`.

---

### Task 1: Create Dynamic Planner Types And Constants

**Files:**
- Create: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Create file with exports**

Create `src/roomPlanner/DynamicPlanner.ts` with:

```ts
import {getCutTiles, Rectangle} from '../algorithms/minCut';
import {Pathing} from '../movement/Pathing';
import {profile} from '../profiler/decorator';
import {StructureMap} from './RoomPlanner';

interface DynamicPlanScore {
	logistics: number;
	defense: number;
	capacity: number;
	terrain: number;
	total: number;
}

export interface DynamicPlanCandidate {
	anchor: RoomPosition;
	map: StructureMap;
	ramparts: RoomPosition[];
	roads: RoomPosition[];
	extensionFields: RoomPosition[];
	score: DynamicPlanScore;
}

const CANDIDATE_LIMIT = 40;
const CORE_RADIUS = 4;
const EXTENSION_FIELD_RADIUS = 8;
const MIN_EXTENSION_FIELD_TILES = 20;

const SCORE_WEIGHTS = {
	logistics: 0.45,
	defense : 0.35,
	capacity: 0.15,
	terrain : 0.05,
};

@profile
export class DynamicPlanner {
	static plan(room: Room): DynamicPlanCandidate | undefined {
		if (!room.controller || room.sources.length == 0) return;
		return undefined;
	}
}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 2: Add Terrain Helpers

**Files:**
- Modify: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Add helper methods inside `DynamicPlanner` before `plan()`**

```ts
	private static isBuildable(terrain: RoomTerrain, x: number, y: number): boolean {
		return x > 1 && x < 48 && y > 1 && y < 48 && terrain.get(x, y) != TERRAIN_MASK_WALL;
	}

	private static terrainPenalty(terrain: RoomTerrain, pos: RoomPosition): number {
		return terrain.get(pos.x, pos.y) == TERRAIN_MASK_SWAMP ? 5 : 1;
	}

	private static positionsInRange(roomName: string, center: RoomPosition, range: number): RoomPosition[] {
		const terrain = Game.map.getRoomTerrain(roomName);
		const positions: RoomPosition[] = [];
		for (let x = Math.max(2, center.x - range); x <= Math.min(47, center.x + range); x++) {
			for (let y = Math.max(2, center.y - range); y <= Math.min(47, center.y + range); y++) {
				if (this.isBuildable(terrain, x, y)) {
					positions.push(new RoomPosition(x, y, roomName));
				}
			}
		}
		return positions;
	}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 3: Generate Core Candidates

**Files:**
- Modify: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Add centroid and candidate methods inside `DynamicPlanner` before `plan()`**

```ts
	private static logisticCentroid(room: Room): RoomPosition {
		const points = _.compact([...room.sources, room.controller]).map(obj => obj.pos);
		const x = Math.round(_.sum(points, pos => pos.x) / points.length);
		const y = Math.round(_.sum(points, pos => pos.y) / points.length);
		return new RoomPosition(Math.max(2, Math.min(47, x)), Math.max(2, Math.min(47, y)), room.name);
	}

	private static coreCandidates(room: Room): RoomPosition[] {
		const terrain = Game.map.getRoomTerrain(room.name);
		const centroid = this.logisticCentroid(room);
		const candidates: RoomPosition[] = [];
		for (let x = 2; x <= 47; x++) {
			for (let y = 2; y <= 47; y++) {
				if (!this.isBuildable(terrain, x, y)) continue;
				const pos = new RoomPosition(x, y, room.name);
				const localBuildable = this.positionsInRange(room.name, pos, CORE_RADIUS).length;
				if (localBuildable >= 18) {
					candidates.push(pos);
				}
			}
		}
		return _.take(_.sortBy(candidates, pos => pos.getRangeTo(centroid) + this.terrainPenalty(terrain, pos)), CANDIDATE_LIMIT);
	}
```

- [ ] **Step 2: Update `plan()` to select first candidate temporarily**

Replace `return undefined;` in `plan()` with:

```ts
		const candidate = this.coreCandidates(room)[0];
		if (!candidate) return;
		return {
			anchor         : candidate,
			map            : {},
			ramparts       : [],
			roads          : [],
			extensionFields: [],
			score          : {logistics: 0, defense: 0, capacity: 0, terrain: 0, total: 0},
		};
```

- [ ] **Step 3: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 4: Score Logistics And Terrain

**Files:**
- Modify: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Add path cost helper inside `DynamicPlanner` before `plan()`**

```ts
	private static pathCost(origin: RoomPosition, target: RoomPosition): number {
		const ret = Pathing.findShortestPath(origin, target, {ignoreStructures: true, allowHostile: true});
		return ret.incomplete ? 10000 : ret.path.length;
	}

	private static logisticsScore(room: Room, anchor: RoomPosition): number {
		const sourceCost = _.sum(room.sources, source => this.pathCost(anchor, source.pos));
		const controllerCost = room.controller ? this.pathCost(anchor, room.controller.pos) : 10000;
		return sourceCost + controllerCost;
	}

	private static terrainScore(room: Room, anchor: RoomPosition): number {
		const terrain = Game.map.getRoomTerrain(room.name);
		return _.sum(this.positionsInRange(room.name, anchor, CORE_RADIUS), pos => this.terrainPenalty(terrain, pos));
	}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 5: Score Defense And Capacity

**Files:**
- Modify: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Add defense rectangle and capacity methods inside `DynamicPlanner` before `plan()`**

```ts
	private static protectionRect(anchor: RoomPosition): Rectangle {
		return {
			x1: Math.max(anchor.x - CORE_RADIUS, 2),
			y1: Math.max(anchor.y - CORE_RADIUS, 2),
			x2: Math.min(anchor.x + CORE_RADIUS, 47),
			y2: Math.min(anchor.y + CORE_RADIUS, 47),
		};
	}

	private static rampartsForAnchor(room: Room, anchor: RoomPosition): RoomPosition[] {
		const rect = this.protectionRect(anchor);
		const cutTiles = getCutTiles(room.name, [rect], true, 2, false);
		return _.map(cutTiles, coord => new RoomPosition(coord.x, coord.y, room.name));
	}

	private static capacityScore(room: Room, anchor: RoomPosition): { score: number, fields: RoomPosition[] } {
		const fields = this.positionsInRange(room.name, anchor, EXTENSION_FIELD_RADIUS);
		const missing = Math.max(0, MIN_EXTENSION_FIELD_TILES - fields.length);
		return {score: missing * 50, fields};
	}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 6: Build Candidate Map

**Files:**
- Modify: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Add map helper inside `DynamicPlanner` before `plan()`**

```ts
	private static buildSeedMap(room: Room, anchor: RoomPosition, extensionFields: RoomPosition[]): StructureMap {
		const map: StructureMap = {};
		const nearby = this.positionsInRange(room.name, anchor, 2);
		map[STRUCTURE_STORAGE] = [anchor];
		map[STRUCTURE_SPAWN] = _.take(_.filter(nearby, pos => !pos.isEqualTo(anchor)), 1);
		map[STRUCTURE_TOWER] = _.take(_.filter(nearby, pos => pos.getRangeTo(anchor) == 2), 1);
		map[STRUCTURE_EXTENSION] = _.take(_.filter(extensionFields, pos => pos.getRangeTo(anchor) > 2), 20);
		map[STRUCTURE_ROAD] = _.take(_.filter(nearby, pos => pos.getRangeTo(anchor) == 1), 8);
		return map;
	}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 7: Return Best Scored Candidate

**Files:**
- Modify: `src/roomPlanner/DynamicPlanner.ts`
- Verify: `npm run build`

- [ ] **Step 1: Replace `plan()` body**

Replace current `plan()` with:

```ts
	static plan(room: Room): DynamicPlanCandidate | undefined {
		if (!room.controller || room.sources.length == 0) return;
		const candidates = this.coreCandidates(room);
		let best: DynamicPlanCandidate | undefined;
		for (const anchor of candidates) {
			const logistics = this.logisticsScore(room, anchor);
			const ramparts = this.rampartsForAnchor(room, anchor);
			const defense = ramparts.length * 10;
			const capacity = this.capacityScore(room, anchor);
			const terrain = this.terrainScore(room, anchor);
			const total = logistics * SCORE_WEIGHTS.logistics
				+ defense * SCORE_WEIGHTS.defense
				+ capacity.score * SCORE_WEIGHTS.capacity
				+ terrain * SCORE_WEIGHTS.terrain;
			const candidate: DynamicPlanCandidate = {
				anchor,
				map            : this.buildSeedMap(room, anchor, capacity.fields),
				ramparts,
				roads          : [],
				extensionFields: capacity.fields,
				score          : {logistics, defense, capacity: capacity.score, terrain, total},
			};
			if (!best || candidate.score.total < best.score.total) {
				best = candidate;
			}
		}
		return best;
	}
```

- [ ] **Step 2: Build verify**

Run: `npm run build`

Expected: compile succeeds.

### Task 8: Final Verification

**Files:**
- Inspect: `src/roomPlanner/DynamicPlanner.ts`
- Inspect: `src/algorithms/minCut.ts`
- Inspect: `docs/superpowers/specs/2026-07-22-dynamic-zone-planner-design.md`
- Inspect: `docs/superpowers/plans/2026-07-22-dynamic-zone-planner.md`

- [ ] **Step 1: Run final build**

Run: `npm run build`

Expected: compile succeeds.

- [ ] **Step 2: Inspect diff**

Run: `git status --short`

Expected: dynamic planner foundation, min-cut visualization guard, design, plan, and generated untracked `tsc-out/` are the only changes.

---

## Self-Review

- Spec coverage: plan creates terrain-first candidate generator, scoring criteria, and `StructureMap` output. It intentionally does not integrate live behavior.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation steps.
- Type consistency: `DynamicPlanCandidate`, `DynamicPlanScore`, and `DynamicPlanner.plan(room)` names match across tasks.
