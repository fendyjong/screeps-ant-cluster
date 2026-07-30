import { gatherEnergy, updatePhase } from './gather';

/** Gather energy, then work the nearest construction site. */
export function run(creep: Creep): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (!site) return;

  creep.memory.taskState = { ...creep.memory.taskState, targetId: site.id };
  if (creep.build(site) === ERR_NOT_IN_RANGE) {
    creep.moveTo(site);
  }
}
