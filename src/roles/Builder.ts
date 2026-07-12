// src/roles/Builder.ts

import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';
import { BUILD_PRIORITIES } from '../colony/Architect';

const MAX_DEMOLISH_PER_TICK = 3;

function findConstructionSite(creep: Creep): ConstructionSite | null {
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  if (sites.length === 0) return null;
  
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

function dismantleStructure(creep: Creep, structureId: string): boolean {
  const structure = Game.getObjectById(structureId) as Structure | null;
  if (!structure) return false;
  
  const result = creep.dismantle(structure);
  if (result === ERR_NOT_IN_RANGE) {
    moveTo(creep, structure);
    return false;
  }
  return result === OK;
}

function buildFromSwapPlan(creep: Creep): boolean {
  const layout = creep.room.memory.layout;
  if (!layout || !layout.swap || layout.swap.build.length === 0) return false;
  
  // Find first construction site that matches build list
  const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
  for (const entry of layout.swap.build) {
    const site = sites.find(s => 
      s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType
    );
    if (site) {
      if (creep.build(site) === ERR_NOT_IN_RANGE) {
        moveTo(creep, site);
      }
      return true;
    }
  }
  
  return false;
}

function harvestEnergy(creep: Creep): void {
  const sources = creep.room.find(FIND_SOURCES);
  if (sources.length > 0) {
    const source = sources[0];
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      moveTo(creep, source);
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  const layout = creep.room.memory.layout;
  const swapPlan = layout?.swap;
  let stateChanged = false;
  
  if (swapPlan && swapPlan.destroy.length > 0) {
    if (swapPlan.state !== 'destroying') {
      swapPlan.state = 'destroying';
      stateChanged = true;
    }
    
    if (!stateChanged) {
      let demolishCount = 0;
      const toRemove: number[] = [];
      
      for (let i = 0; i < swapPlan.destroy.length && demolishCount < MAX_DEMOLISH_PER_TICK; i++) {
        const structureId = swapPlan.destroy[i];
        const structure = Game.getObjectById(structureId) as Structure | null;
        
        if (!structure) {
          toRemove.push(i);
          continue;
        }
        
        const success = dismantleStructure(creep, structureId);
        if (success) {
          toRemove.push(i);
          demolishCount++;
        }
      }
      
      for (let i = toRemove.length - 1; i >= 0; i--) {
        swapPlan.destroy.splice(toRemove[i], 1);
      }
    }
    
    return;
  }
  
  if (swapPlan && swapPlan.build.length > 0) {
    if (swapPlan.state !== 'building') {
      swapPlan.state = 'building';
      stateChanged = true;
    }
    
    if (!stateChanged) {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        const built = buildFromSwapPlan(creep);
        if (!built) {
          buildStructures(creep);
        }
      } else {
        harvestEnergy(creep);
      }
    }
    
    return;
  }
  
  if (swapPlan) {
    if (swapPlan.state !== 'idle') {
      swapPlan.state = 'idle';
    }
  }
  
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
    harvestEnergy(creep);
  }
}
