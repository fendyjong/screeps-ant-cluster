import { CostMatrix } from 'screeps';
import { getTerrainMatrix, isWalkable, findOptimalTowerPositions } from '../lib/TerrainMatrix';

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

  // Fallback to anchor (spawn) if not enough walkable tiles
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

function computeRampartPositions(
	core: BunkerLayout, labs: RoomPosition[], extensions: RoomPosition[]
): RoomPosition[] {
	const ramparts: RoomPosition[] = [];

	const corePositions = [
		core.spawn, core.storage, core.terminal, core.factory,
		core.powerSpawn, core.nuker, core.observer, core.linkSpawn
	];
	for (const pos of corePositions) {
		if (pos && isWalkablePos(pos)) ramparts.push(pos);
	}

	for (const pos of labs) ramparts.push(pos);
	for (const pos of core.towers) {
		if (pos && isWalkablePos(pos)) ramparts.push(pos);
	}

	return ramparts;
}

function computeWallPositions(room: Room, matrix: CostMatrix, allStructureKeys: Set<string>): RoomPosition[] {
	const walls: RoomPosition[] = [];
	const roomName = room.name;

	for (const key of allStructureKeys) {
		const [x, y] = key.split(',').map(Number);
		for (const adj of getAdjacentWalkable(matrix, new RoomPosition(x, y, roomName))) {
			const k = adj.x + ',' + adj.y;
			if (!allStructureKeys.has(k)) {
				walls.push(adj);
			}
		}
	}

	return walls.slice(0, 50);
}

function computeRoadPositions(
	room: Room, matrix: CostMatrix,
	core: BunkerLayout, extensions: RoomPosition[]
): RoomPosition[] {
	const roads: RoomPosition[] = [];

	for (const ext of extensions) {
		roads.push(ext);
	}

	return roads;
}

export function planLayout(room: Room): BunkerLayout {
	const matrix = getTerrainMatrix(room.name);
	const anchor = findSpawnPosition(room.name);

	// Phase 1: Core zone
	const core = carveCoreZone(room, anchor, matrix);

	// Collect core tile keys
	const coreKeys = new Set<string>();
	coreKeys.add(core.spawn.x + ',' + core.spawn.y);
	coreKeys.add(core.storage.x + ',' + core.storage.y);
	coreKeys.add(core.terminal.x + ',' + core.terminal.y);
	coreKeys.add(core.factory.x + ',' + core.factory.y);
	coreKeys.add(core.powerSpawn.x + ',' + core.powerSpawn.y);
	coreKeys.add(core.nuker.x + ',' + core.nuker.y);
	coreKeys.add(core.observer.x + ',' + core.observer.y);
	coreKeys.add(core.linkSpawn.x + ',' + core.linkSpawn.y);

	// Phase 2: Lab zone
	const labs = carveLabZone(room, matrix, coreKeys);
	core.labs = labs;

	const labKeys = new Set(labs.map(p => p.x + ',' + p.y));

	// Phase 3: Extensions
	const extensions = carveExtensions(room, matrix, coreKeys, labKeys);
	core.extensions = extensions;

	// Phase 4: Towers
	core.towers = placeTowers(room, matrix, extensions);

	// Phase 5: Ramparts + walls
	const allKeys = new Set<string>();
	for (const k of coreKeys) allKeys.add(k);
	for (const k of labKeys) allKeys.add(k);
	for (const ext of extensions) allKeys.add(ext.x + ',' + ext.y);
	for (const t of core.towers) allKeys.add(t.x + ',' + t.y);

	core.ramparts = computeRampartPositions(core, labs, extensions);
	core.walls = computeWallPositions(room, matrix, allKeys);

	// Phase 6: Roads
	core.roads = computeRoadPositions(room, matrix, core, extensions);

	// Controller link
	if (room.controller) {
		core.linkController = new RoomPosition(room.controller.pos.x + 1, room.controller.pos.y, room.name);
		if (!isWalkable(matrix, core.linkController.x, core.linkController.y)) {
			core.linkController = new RoomPosition(room.controller.pos.x, room.controller.pos.y + 1, room.name);
		}
	}
	core.linkLab = labs.length > 0 ? labs[Math.floor(labs.length / 2)] : core.linkSpawn;

	return core;
}

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

  // Check terminal
  const existingTerminal = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TERMINAL
  })[0];
  if (existingTerminal && !existingTerminal.pos.isEqualTo(layout.terminal)) {
    if (isSafeToDestroy(room, existingTerminal)) {
      destroy.push(existingTerminal.id);
      build.push({ pos: layout.terminal, structureType: STRUCTURE_TERMINAL });
    }
  }

  // Check factory
  const existingFactory = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_FACTORY
  })[0];
  if (existingFactory && !existingFactory.pos.isEqualTo(layout.factory)) {
    if (isSafeToDestroy(room, existingFactory)) {
      destroy.push(existingFactory.id);
      build.push({ pos: layout.factory, structureType: STRUCTURE_FACTORY });
    }
  }

  // Check power spawn
  const existingPowerSpawn = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_POWER_SPAWN
  })[0];
  if (existingPowerSpawn && !existingPowerSpawn.pos.isEqualTo(layout.powerSpawn)) {
    if (isSafeToDestroy(room, existingPowerSpawn)) {
      destroy.push(existingPowerSpawn.id);
      build.push({ pos: layout.powerSpawn, structureType: STRUCTURE_POWER_SPAWN });
    }
  }

  // Check nuker
  const existingNuker = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_NUKER
  })[0];
  if (existingNuker && !existingNuker.pos.isEqualTo(layout.nuker)) {
    if (isSafeToDestroy(room, existingNuker)) {
      destroy.push(existingNuker.id);
      build.push({ pos: layout.nuker, structureType: STRUCTURE_NUKER });
    }
  }

  // Check observer
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

  // Check labs
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

  // Check links
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

  // Check extensions
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

  // Sort build list by priority
  const sortedBuild = sortByPriority(build);
  
  return {
    destroy,
    build: sortedBuild,
    state: 'idle',
  };
}

function isWalkablePos(pos: RoomPosition): boolean {
  return pos !== undefined && pos.x >= 0 && pos.x < 50 && pos.y >= 0 && pos.y < 50;
}
