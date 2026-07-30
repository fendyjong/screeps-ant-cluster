import { BUILD_SATURATION_SITES, MIN_BODY_COST, UPGRADE_BASELINE } from '../config';
import { Stimuli } from '../types';

export interface RoomSnapshot {
  energyAvailable: number;
  energyCapacityAvailable: number;
  hasController: boolean;
  constructionSiteCount: number;
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

  return {
    supply: clamp01(supply),
    upgrade: s.hasController ? UPGRADE_BASELINE : 0,
    build: clamp01(s.constructionSiteCount / BUILD_SATURATION_SITES),
  };
}
