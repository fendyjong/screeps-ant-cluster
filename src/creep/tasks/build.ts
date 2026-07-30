import { REPAIR_THRESHOLD } from '../../config';
import { gatherEnergy, updatePhase } from './gather';
import { recordWork } from '../../evolution';

/** Gather energy, then work the nearest construction site. */
export function run(creep: Creep, value: number): void {
  if (updatePhase(creep) === 'gathering') {
    gatherEnergy(creep);
    recordWork(creep);
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (!site) {
    // Nothing to construct — maintain instead. Roads wear out under the colony's
    // own traffic, and with nobody repairing them the network dissolves (125
    // roads decayed to 22, all under half health). Repair costs 0.01 energy per
    // hit against 300 to rebuild a road, so upkeep is far cheaper than
    // replacement, and it gives builders real work when no sites exist rather
    // than leaving them idle.
    const worn = creep.room
      .find(FIND_STRUCTURES)
      .filter(
        s =>
          (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) &&
          s.hits < s.hitsMax * REPAIR_THRESHOLD,
      )
      .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax);

    const target = worn[0];
    if (!target) {
      // Genuinely nothing to do: this is the idling fitness must punish.
      recordWork(creep);
      return;
    }

    const repaired = creep.repair(target);
    if (repaired === ERR_NOT_IN_RANGE) creep.moveTo(target);
    recordWork(creep);
    return;
  }

  creep.memory.taskState = { ...creep.memory.taskState, targetId: site.id };
  const result = creep.build(site);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(site);
  recordWork(creep);
}
