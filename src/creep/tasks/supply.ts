import { gatherEnergy, updatePhase } from './gather';
import { recordWork } from '../../evolution';

/** Gather energy, then top up the spawn and extensions. */
export function run(creep: Creep, value: number): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    // Gathering counts as productive only if a source was actually worked;
    // walking to one with nothing to harvest is idling.
    recordWork(creep);
    return;
  }

  // FIND_STRUCTURES + explicit `my`, not FIND_MY_STRUCTURES — the latter came
  // back empty on this server, so supply could never find a delivery target and
  // the spawn was never refilled.
  const sinks: (StructureSpawn | StructureExtension | StructureLink)[] = creep.room
    .find(FIND_STRUCTURES)
    .filter(
    (s): s is StructureSpawn | StructureExtension =>
      (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
      (s as StructureSpawn).my === true &&
      (s as StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  );

  // A link beside a source counts as a delivery target, and usually the best one.
  //
  // Without this the link pair is inert: the colony can build both ends and still
  // move nothing, because nothing ever puts energy into the source end. A creep
  // that has just filled up standing next to a source is already touching it, so
  // depositing there costs no travel at all and the energy arrives at the
  // controller for a flat 3% instead of a round trip on foot.
  //
  // Only source-side links qualify. Feeding the controller link directly would be
  // a creep walking to the controller to hand energy to the thing whose whole job
  // is to spare it that walk.
  const controllerPos = creep.room.controller?.pos;
  const sources = creep.room.find(FIND_SOURCES);
  const sourceLinks = creep.room
    .find(FIND_STRUCTURES)
    .filter(
      (s): s is StructureLink =>
        s.structureType === STRUCTURE_LINK &&
        (s as StructureLink).my &&
        (s as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        (!controllerPos || s.pos.getRangeTo(controllerPos) > 3) &&
        sources.some(src => s.pos.getRangeTo(src) <= 3),
    );
  sinks.push(...sourceLinks);

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
    recordWork(creep);
    return;
  }

  creep.memory.taskState = { ...creep.memory.taskState, targetId: target.id };
  const result = creep.transfer(target, RESOURCE_ENERGY);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
  recordWork(creep);
}
