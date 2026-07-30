import { gatherEnergy, updatePhase } from './gather';

/** Gather energy, then push it into the controller. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    return;
  }

  const controller = creep.room.controller;
  if (!controller) return;

  creep.memory.taskState = { ...creep.memory.taskState, targetId: controller.id };
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller);
  }
}
