import { Goal } from '../types';
import { moveTo } from '../lib/Pathing';

function upgradeController(creep: Creep): void {
  if (!creep.room.controller) return;
  
  if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    moveTo(creep, creep.room.controller);
  }
}

function parkNearSpawn(creep: Creep): void {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (spawn) {
    const range = creep.pos.getRangeTo(spawn);
    if (range > 3) {
      moveTo(creep, spawn.pos);
    }
  }
}

export function run(creep: Creep, goal: Goal): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    switch (goal) {
      case Goal.ECONOMY:
        upgradeController(creep);
        break;
      case Goal.DEFEND:
        parkNearSpawn(creep);
        break;
      case Goal.RECOVER:
        upgradeController(creep);
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
