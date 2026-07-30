import { BUILD_SATURATION_SITES, MIN_BODY_COST, UPGRADE_BASELINE } from '../config';
import { Stimuli } from '../types';

export interface RoomSnapshot {
  energyAvailable: number;
  energyCapacityAvailable: number;
  hasController: boolean;
  constructionSiteCount: number;
}

export function readRoom(room: Room): RoomSnapshot {
  return {
    energyAvailable: room.energyAvailable,
    energyCapacityAvailable: room.energyCapacityAvailable,
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
