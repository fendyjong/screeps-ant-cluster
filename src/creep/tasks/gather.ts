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

/** The colony's granary, if one has been built and has anything in it. */
export function storageWithEnergy(room: Room): StructureStorage | undefined {
  return room
    .find(FIND_STRUCTURES)
    .find(
      (s): s is StructureStorage =>
        s.structureType === STRUCTURE_STORAGE &&
        (s as StructureStorage).my === true &&
        (s as StructureStorage).store.getUsedCapacity(RESOURCE_ENERGY) > 0,
    );
}

/**
 * One tick of harvesting from the nearest active source.
 *
 * `fromStore` lets a consumer draw on the granary instead of mining. The
 * difference is not marginal: harvesting is rate-limited to HARVEST_POWER (2)
 * per WORK part per tick, so a 2-WORK creep needs ~50 ticks to fill a 100-energy
 * store, whereas a withdraw is a single instant transfer. An upgrader that mines
 * its own energy spends most of its life not upgrading — which is precisely why
 * measured upgrade output sat at 1.70 energy/tick against ~35 available.
 *
 * Producers keep mining. Only consumers draw, so the granary has a filler and a
 * drainer rather than a loop that empties it.
 */
export function gatherEnergy(creep: Creep, fromStore = false): void {
  if (fromStore) {
    const store = storageWithEnergy(creep.room);
    if (store) {
      if (creep.withdraw(store, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(store, { visualizePathStyle: { stroke: COLORS.hud } });
      }
      return;
    }
  }

  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
  if (!source) return;
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source, { visualizePathStyle: { stroke: COLORS.hud } });
  }
}
