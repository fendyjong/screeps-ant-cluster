// src/roles/Harvester.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function findSource(creep: Creep): Source | null {
  const sources = creep.room.find(FIND_SOURCES);
  if (sources.length === 0) return null;
  
  // Prefer source with energy
  for (const source of sources) {
    if (source.energy > 0) return source;
  }
  
  return sources[0];
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
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        moveTo(creep, source);
      }
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

export function run(creep: Creep, goal: Goal): void {
  switch (goal) {
    case Goal.ECONOMY:
      harvestAndTransfer(creep);
      break;
    case Goal.DEFEND:
      repairNearby(creep);
      break;
    case Goal.RECOVER:
      harvestAndTransfer(creep);
      break;
  }
}
