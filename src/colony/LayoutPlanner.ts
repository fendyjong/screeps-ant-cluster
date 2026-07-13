import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';
import { findOptimalTowerPositions } from './TowerPlanner';
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