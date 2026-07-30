import { gatherEnergy, updatePhase } from './gather';
import { recordWork } from '../../evolution';

/** Gather energy, then work the nearest construction site. */
export function run(creep: Creep, value: number): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    recordWork(creep, creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0, value);
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (!site) {
    // No site to work: this is the idling the fitness function must punish.
    recordWork(creep, false, value);
    return;
  }

  creep.memory.taskState = { ...creep.memory.taskState, targetId: site.id };
  const result = creep.build(site);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(site);
  recordWork(creep, result === OK || result === ERR_NOT_IN_RANGE, value);
}
