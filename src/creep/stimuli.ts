import {
  BUILD_SATURATION_SITES,
  CAPACITY_BUILD_PER_SITE,
  CAPACITY_REMOTE,
  REMOTE_ENABLED,
  CAPACITY_SUPPLY,
  CAPACITY_UPGRADE,
  CONGESTION_FACTOR,
  MIN_BODY_COST,
  UPGRADE_BASELINE,
  WORK_PER_SOURCE,
} from '../config';
import { Stimuli, TASK_NAMES, TaskName } from '../types';

export interface RoomSnapshot {
  energyAvailable: number;
  energyCapacityAvailable: number;
  hasController: boolean;
  constructionSiteCount: number;
  /** Sources in the home room — sets the room's hard income ceiling. */
  sourceCount: number;
  /** WORK parts the colony is fielding, to compare against that ceiling. */
  workParts: number;
}

/**
 * Sums energy across spawns and extensions directly instead of trusting
 * `room.energyAvailable` / `room.energyCapacityAvailable`.
 *
 * Observed 2026-07-30 (tick ~86120): both room properties arrived as `undefined`
 * on this server, which serialized into telemetry as null. `computeStimuli` then
 * fell through to `else supply = 0`, so the supply stimulus was pinned at zero —
 * no creep ever refilled the spawn, the saturating starvation guard could never
 * fire, and the colony ran monotask on `upgrade` while its spawn sat empty.
 * Reading the structures is unambiguous and cannot silently degrade this way.
 */
export function readEnergy(room: Room): { available: number; capacity: number } {
  // Uses FIND_STRUCTURES + an explicit `my` check rather than FIND_MY_STRUCTURES:
  // the latter returned an empty list on this server (readEnergy reported a
  // capacity of 0 for a room holding a spawn, which must report 300).
  const stores = room
    .find(FIND_STRUCTURES)
    .filter(
      (s): s is StructureSpawn | StructureExtension =>
        (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
        (s as StructureSpawn).my === true,
    );

  let available = 0;
  let capacity = 0;
  for (const s of stores) {
    available += s.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    capacity += s.store.getCapacity(RESOURCE_ENERGY) ?? 0;
  }
  return { available, capacity };
}

export function readRoom(room: Room): RoomSnapshot {
  const energy = readEnergy(room);
  return {
    energyAvailable: energy.available,
    energyCapacityAvailable: energy.capacity,
    hasController: room.controller !== undefined && room.controller.my,
    constructionSiteCount: room.find(FIND_CONSTRUCTION_SITES).length,
    sourceCount: room.find(FIND_SOURCES).length,
    workParts: room
      .find(FIND_MY_CREEPS)
      .reduce((sum, c) => sum + c.body.filter(p => p.type === WORK).length, 0),
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Pure. Supply SATURATES rather than scaling: if the room cannot afford to
 * replace a creep, its stimulus pegs at 1.0 so it clears essentially every
 * threshold. That is the guard against unrecoverable bootstrap death, and it is
 * not a central override — each creep still decides alone, the stimulus is just
 * shaped the way real hunger signals are.
 */
export function computeStimuli(s: RoomSnapshot): Stimuli {
  let supply: number;
  if (s.energyAvailable < MIN_BODY_COST) {
    supply = 1;
  } else if (s.energyCapacityAvailable > 0) {
    supply = 1 - s.energyAvailable / s.energyCapacityAvailable;
  } else {
    supply = 0;
  }

  // Remote foraging becomes attractive exactly when the home room is
  // oversubscribed: past WORK_PER_SOURCE per source, extra WORK parts sit idle
  // and the only way to raise income is more territory (research doc §7.1.1).
  const sustainable = s.sourceCount * WORK_PER_SOURCE;
  const surplusWork = sustainable > 0 ? (s.workParts - sustainable) / sustainable : 0;

  return {
    supply: clamp01(supply),
    upgrade: s.hasController ? UPGRADE_BASELINE : 0,
    build: clamp01(s.constructionSiteCount / BUILD_SATURATION_SITES),
    remote: REMOTE_ENABLED ? clamp01(surplusWork) : 0,
  };
}

/**
 * Damps each stimulus by how many creeps already hold that task — the colony's
 * stand-in for physical congestion at a work site. A creep deciding late sees a
 * weaker signal than the one that arrived first, which caps recruitment near the
 * productive level instead of letting a saturated stimulus draft everybody.
 *
 * Pure: occupancy in, damped stimuli out.
 */
export function applyCongestion(
  stimuli: Stimuli,
  occupancy: Record<TaskName, number>,
  snapshot: RoomSnapshot,
): Stimuli {
  const capacity: Record<TaskName, number> = {
    supply: CAPACITY_SUPPLY,
    upgrade: CAPACITY_UPGRADE,
    build: snapshot.constructionSiteCount * CAPACITY_BUILD_PER_SITE,
    remote: CAPACITY_REMOTE,
  };

  const damped = {} as Stimuli;
  for (const task of TASK_NAMES) {
    // Only workers beyond capacity crowd the site; the first few cost nothing.
    const excess = Math.max(0, occupancy[task] - capacity[task]);
    damped[task] = stimuli[task] / (1 + excess * CONGESTION_FACTOR);
  }
  return damped;
}
