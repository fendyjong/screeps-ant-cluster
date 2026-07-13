import { getTerrainMatrix, isWalkable, findOptimalTowerPositions, findChokepoints } from '../lib/TerrainMatrix';

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

function findWallPositions(roomName: string, _layout: BunkerLayout): RoomPosition[] {
  return findChokepoints(roomName).slice(0, 20);
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

  // Check labs
  const existingLabs = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LAB
  });
  const labPosSet = new Set(layout.labs.map(p => p.x + ',' + p.y));
  for (const lab of existingLabs) {
    if (!labPosSet.has(lab.pos.x + ',' + lab.pos.y)) {
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
  const linkPosSet = new Set(linkPositions.map(p => p.x + ',' + p.y));
  for (const link of existingLinks) {
    if (!linkPosSet.has(link.pos.x + ',' + link.pos.y)) {
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
  const extPosSet = new Set(layout.extensions.map(p => p.x + ',' + p.y));
  for (const ext of existingExtensions) {
    if (!extPosSet.has(ext.pos.x + ',' + ext.pos.y)) {
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
  return pos !== undefined && pos.x >= 0 && pos.y >= 0;
}
