import { gatherEnergy, updatePhase } from './gather';

/** Gather energy, then top up the spawn and extensions. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    return;
  }

  const sinks = creep.room.find(FIND_MY_STRUCTURES).filter(
    (s): s is StructureSpawn | StructureExtension =>
      (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
      (s as StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  );

  const target = creep.pos.findClosestByPath(sinks);
  if (!target) return;

  creep.memory.taskState = { ...creep.memory.taskState, targetId: target.id };
  if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    creep.moveTo(target);
  }
}
