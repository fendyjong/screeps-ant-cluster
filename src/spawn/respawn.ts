import {
  COLONY_SIZE,
  DEFAULT_TASK,
  IDEAL_BODY,
  IDEAL_BODY_COST,
  MIN_BODY,
  MIN_BODY_COST,
} from '../config';
import { generateProfile } from '../creep/thresholds';

/** Largest affordable body, or null if even the minimum is out of reach. */
export function bodyFor(energy: number): BodyPartConstant[] | null {
  if (energy >= IDEAL_BODY_COST) return IDEAL_BODY;
  if (energy >= MIN_BODY_COST) return MIN_BODY;
  return null;
}

/**
 * Dumb fixed-N respawn. Returns true only if a creep was actually spawned.
 * Too little energy is normal at RCL1, not an error — skip quietly and retry.
 */
export function runSpawning(room: Room): boolean {
  const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
  if (!spawn) return false;

  if (room.find(FIND_MY_CREEPS).length >= COLONY_SIZE) return false;

  const body = bodyFor(room.energyAvailable);
  if (!body) return false;

  const result = spawn.spawnCreep(body, `ant_${Game.time}`, {
    memory: {
      task: DEFAULT_TASK,
      thresholds: generateProfile(),
      taskState: {},
    },
  });

  return result === OK;
}
