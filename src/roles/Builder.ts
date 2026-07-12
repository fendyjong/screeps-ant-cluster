// src/roles/Builder.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function findConstructionSite(creep: Creep): ConstructionSite | null {
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  if (sites.length === 0) return null;
  
  // Prioritize by progress ratio
  return creep.pos.findClosestByPath(sites);
}

function findDamagedStructure(creep: Creep): Structure | null {
  const structures = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
  });
  
  if (structures.length === 0) return null;
  
  return creep.pos.findClosestByPath(structures);
}

function buildStructures(creep: Creep): void {
  const site = findConstructionSite(creep);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) {
      moveTo(creep, site);
    }
  }
}

function repairStructures(creep: Creep): void {
  const structure = findDamagedStructure(creep);
  if (structure) {
    if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
      moveTo(creep, structure);
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    switch (goal) {
      case Goal.ECONOMY:
        buildStructures(creep);
        break;
      case Goal.DEFEND:
        repairStructures(creep);
        break;
      case Goal.RECOVER:
        repairStructures(creep);
        break;
    }
  } else {
    // Find energy
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
      const source = sources[0];
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        moveTo(creep, source);
      }
    }
  }
}
