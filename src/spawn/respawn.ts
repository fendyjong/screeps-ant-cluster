import {
  BODY_UNIT_COST,
  COLONY_MAX,
  COLONY_MIN,
  DEFAULT_TASK,
  GROWTH_MIN_RESERVE,
  SPAWN_STAGGER_TICKS,
  MAX_BODY_UNITS,
  IDEAL_BODY,
  IDEAL_BODY_COST,
  MIN_BODY,
  MIN_BODY_COST,
} from '../config';
import { breed } from '../evolution';

/**
 * Largest affordable body, or null if even the minimum is out of reach.
 *
 * Repeats the [WORK, CARRY, MOVE] unit so the creep keeps a 1:1 MOVE ratio and
 * stays at full speed off-road. Scaling matters because UPGRADE_CONTROLLER_POWER
 * is per WORK part: a 600-energy creep upgrades three times as fast as a
 * 200-energy one, and upgrade throughput is the sole gate on GCL and therefore
 * on expansion.
 */
export function bodyFor(energy: number): BodyPartConstant[] | null {
  if (energy < MIN_BODY_COST) return null;

  const units = Math.min(Math.floor(energy / BODY_UNIT_COST), MAX_BODY_UNITS);
  const body: BodyPartConstant[] = [];
  for (let i = 0; i < units; i++) body.push(WORK);
  for (let i = 0; i < units; i++) body.push(CARRY);
  for (let i = 0; i < units; i++) body.push(MOVE);
  return body;
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
    // Absolute, not a share of capacity — see GROWTH_MIN_RESERVE.
    if (energy.available < GROWTH_MIN_RESERVE) return null;

    // Stagger growth so the population does not become a single age-cohort that
    // dies together. Survival spawning skips this entirely.
    const last = Memory.lastGrowthSpawn ?? -SPAWN_STAGGER_TICKS;
    if (Game.time - last < SPAWN_STAGGER_TICKS) return null;
  }

  const body = bodyFor(energy.available);
  if (!body) return null;

  const result = spawn.spawnCreep(body, `ant_${Game.time}`, {
    memory: {
      task: DEFAULT_TASK,
      thresholds: breed(),
      taskState: {},
    },
  });

  if (result === OK && reason === 'growth') Memory.lastGrowthSpawn = Game.time;
  return result === OK ? reason : null;
}
