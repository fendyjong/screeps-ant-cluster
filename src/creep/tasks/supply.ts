import { gatherEnergy, updatePhase } from './gather';
import { recordWork } from '../../evolution';

/** Gather energy, then top up the spawn and extensions. */
export function run(creep: Creep, value: number): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    // Gathering counts as productive only if a source was actually worked;
    // walking to one with nothing to harvest is idling.
    recordWork(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0, value);
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

  // Spawn and extensions first — they gate spawning, so they are worth more
  // full than the granary is. The granary takes the overflow, which is the
  // whole point of having one: before it existed, a supplier arriving at a full
  // nest simply stopped, and its load rode around until the creep died.
  const target =
    creep.pos.findClosestByPath(sinks) ??
    creep.room
      .find(FIND_STRUCTURES)
      .find(
        (s): s is StructureStorage =>
          s.structureType === STRUCTURE_STORAGE &&
          (s as StructureStorage).my === true &&
          (s as StructureStorage).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      );

  if (!target) {
    recordWork(creep, false, value);
    return;
  }

  creep.memory.taskState = { ...creep.memory.taskState, targetId: target.id };
  const result = creep.transfer(target, RESOURCE_ENERGY);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
  recordWork(creep, result === OK || result === ERR_NOT_IN_RANGE, value);
}
