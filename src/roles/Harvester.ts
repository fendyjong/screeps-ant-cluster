// src/roles/Harvester.ts

import { moveTo } from '../lib/Pathing';
import { getTerrainMatrix } from '../lib/PathFinder';

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
      h.memory.targetSourceId === source.id
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
  // Prefer containers and storage
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
  
  // Fallback to spawn and extensions
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

function harvestAndTransfer(creep: Creep): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const source = findSource(creep);
    if (!source) return;

    creep.memory.targetSourceId = source.id;

    const totalAdj = [...getAdjacentWalkable(getTerrainMatrix(creep.room.name), source.pos)].length;
    const busyAdj = source.pos.findInRange(FIND_MY_CREEPS, 1)
      .filter((c: Creep) => c.pos.getRangeTo(source) === 1).length;

    if (busyAdj >= totalAdj && totalAdj > 0 && creep.pos.getRangeTo(source) <= 1) {
      const freeSpots = getAdjacentWalkable(getTerrainMatrix(creep.room.name), source.pos)
        .filter((p: RoomPosition) => creep.room.lookForAt(LOOK_CREEPS, p.x, p.y).length === 0);
      if (freeSpots.length > 0) {
        moveTo(creep, freeSpots[0]);
        return;
      }
    }

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      moveTo(creep, source);
    }
  } else {
    const dropOff = findDropOff(creep);
    if (dropOff) {
      if (creep.transfer(dropOff, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, dropOff);
      }
    }
  }
}

function repairNearby(creep: Creep): void {
  const damagedStructures = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
  });
  
  if (damagedStructures.length > 0) {
    const target = creep.pos.findClosestByPath(damagedStructures);
    if (target) {
      if (creep.repair(target) === ERR_NOT_IN_RANGE) {
        moveTo(creep, target);
      }
    }
  }
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
    const matrixCost = matrix.get(x, y);
    if (x >= 0 && x < 50 && y >= 0 && y < 50 && matrixCost < 255) {
      result.push(new RoomPosition(x, y, pos.roomName));
    }
  }
  return result;
}

export function run(creep: Creep): void {
  harvestAndTransfer(creep);
}
