import { gatherEnergy, updatePhase } from './gather';
import { recordWork } from '../../evolution';

/** Gather energy, then top up the spawn and extensions. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    // Gathering counts as productive only if a source was actually worked;
    // walking to one with nothing to harvest is idling.
    recordWork(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
    return;
  }

  // FIND_STRUCTURES + explicit `my`, not FIND_MY_STRUCTURES — the latter came
  // back empty on this server, so supply could never find a delivery target and
  // the spawn was never refilled.
  const sinks = creep.room.find(FIND_STRUCTURES).filter(
    (s): s is StructureSpawn | StructureExtension =>
      (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
      (s as StructureSpawn).my === true &&
      (s as StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  );

  const target = creep.pos.findClosestByPath(sinks);
  if (!target) {
    recordWork(creep, false);
    return;
  }

  creep.memory.taskState = { ...creep.memory.taskState, targetId: target.id };
  const result = creep.transfer(target, RESOURCE_ENERGY);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
  recordWork(creep, result === OK || result === ERR_NOT_IN_RANGE);
}
