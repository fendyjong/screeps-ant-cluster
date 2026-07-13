import { moveTo } from '../lib/Pathing';

function findEnergy(creep: Creep): Resource | null {
  // Look for dropped energy
  const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
  });

  if (droppedEnergy.length > 0) {
    return creep.pos.findClosestByPath(droppedEnergy);
  }

  // Look for containers with energy
  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => (
      s.structureType === STRUCTURE_CONTAINER &&
      s.store[RESOURCE_ENERGY] > 0
    )
  });

  if (containers.length > 0) {
    return creep.pos.findClosestByPath(containers);
  }

  return null;
}

function findDropOff(creep: Creep): Structure | null {
  // Prefer spawn and extensions
  const targets = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      (s.structureType === STRUCTURE_SPAWN ||
       s.structureType === STRUCTURE_EXTENSION) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });

  if (targets.length > 0) {
    return creep.pos.findClosestByPath(targets);
  }

  // Fallback to storage
  const storage = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      s.structureType === STRUCTURE_STORAGE &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });

  if (storage.length > 0) {
    return storage[0];
  }

  return null;
}

function haulEnergy(creep: Creep): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const energy = findEnergy(creep);
    if (energy) {
      if (energy instanceof Structure) {
        if (creep.withdraw(energy, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          moveTo(creep, energy);
        }
      } else {
        if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
          moveTo(creep, energy);
        }
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

function deliverToTowers(creep: Creep): void {
  const towers = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s) => (
      s.structureType === STRUCTURE_TOWER &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    )
  });

  if (towers.length > 0) {
    const tower = creep.pos.findClosestByPath(towers);
    if (tower) {
      if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, tower);
      }
    }
  }
}

export function run(creep: Creep): void {
  haulEnergy(creep);
}
