import {
  COLONY_MAX,
  COLONY_MIN,
  DEFAULT_TASK,
  GROWTH_SURPLUS_RATIO,
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

export type SpawnReason = 'survival' | 'growth';

/**
 * Quorum-driven spawning. There is no target headcount: below COLONY_MIN the
 * colony always replaces (survival), and above it the colony only invests in a
 * new worker while its reserves are satiated. Returns the reason a creep was
 * spawned, or null if none was.
 *
 * Too little energy is normal, not an error — skip quietly and retry.
 */
export function runSpawning(
  room: Room,
  energy: { available: number; capacity: number },
): SpawnReason | null {
  const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
  if (!spawn) return null;

  const alive = room.find(FIND_MY_CREEPS).length;
  if (alive >= COLONY_MAX) return null;

  const reason: SpawnReason = alive < COLONY_MIN ? 'survival' : 'growth';
  if (reason === 'growth') {
    const ratio = energy.capacity > 0 ? energy.available / energy.capacity : 0;
    if (ratio < GROWTH_SURPLUS_RATIO) return null;
  }

  const body = bodyFor(energy.available);
  if (!body) return null;

  const result = spawn.spawnCreep(body, `ant_${Game.time}`, {
    memory: {
      task: DEFAULT_TASK,
      thresholds: generateProfile(),
      taskState: {},
    },
  });

  return result === OK ? reason : null;
}
