import { gatherEnergy, updatePhase } from './gather';
import { recordWork } from '../../evolution';

/** Gather energy, then push it into the controller. */
export function run(creep: Creep, value: number): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    recordWork(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0, value);
    return;
  }

  const controller = creep.room.controller;
  if (!controller) {
    recordWork(creep, false, value);
    return;
  }

  creep.memory.taskState = { ...creep.memory.taskState, targetId: controller.id };
  const result = creep.upgradeController(controller);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(controller);
  recordWork(creep, result === OK || result === ERR_NOT_IN_RANGE, value);
}
