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
  
  return {
    destroy,
    build,
    state: 'idle',
  };
}
