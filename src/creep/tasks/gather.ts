import { COLORS } from '../../config';
import { TaskPhase } from '../../types';

/**
 * Flips the creep between gathering and delivering based on how full it is,
 * persists the phase, and returns it. Clears the stale target on every flip.
 */
export function updatePhase(creep: Creep): TaskPhase {
  const state = creep.memory.taskState ?? {};
  if (!state.phase) state.phase = 'gathering';

  if (state.phase === 'gathering' && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    state.phase = 'delivering';
    delete state.targetId;
  } else if (state.phase === 'delivering' && creep.store[RESOURCE_ENERGY] === 0) {
    state.phase = 'gathering';
    delete state.targetId;
  }

  creep.memory.taskState = state;
  return state.phase;
}

/** One tick of harvesting from the nearest active source. */
export function gatherEnergy(creep: Creep): void {
  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
  if (!source) return;
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, { visualizePathStyle: { stroke: COLORS.hud } });
  }
}
