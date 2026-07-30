import {
  BODY_UNIT,
  BODY_UNIT_COST,
  RESERVER_BODY,
  RESERVER_COST,
  RESERVE_ENABLED,
  RESERVE_MAX,
  RESERVE_WORKFORCE_FRACTION,
  COLONY_MAX,
  COLONY_MIN_FRACTION,
  DEFAULT_TASK,
  GROWTH_MIN_RESERVE,
  SPAWN_STAGGER_TICKS,
  SURVIVAL_STAGGER_TICKS,
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
  if (units < 1) return MIN_BODY;

  // Parts are grouped by type rather than interleaved: damage consumes parts in
  // order, so keeping MOVE last means a wounded creep keeps its mobility longest.
  const body: BodyPartConstant[] = [];
  for (const part of [WORK, CARRY, MOVE] as BodyPartConstant[]) {
    const perUnit = BODY_UNIT.filter(p => p === part).length;
    for (let i = 0; i < perUnit * units; i++) body.push(part);
  }
  return body;
}

export type SpawnReason = 'survival' | 'growth' | 'reserver';

/**
 * Rooms worth reserving: seen, holding sources, and not hostile. Reservation
 * doubles a remote source's yield, so it only pays where foraging already goes.
 */
export function reservationTargets(): string[] {
  const intel = Memory.remotes ?? {};
  const home = Object.keys(Game.rooms).filter(r => Game.rooms[r].controller?.my);
  return Object.entries(intel)
    .filter(([room, v]) => !home.includes(room) && v.sources > 0 && !v.hostile)
    .sort((a, b) => b[1].sources - a[1].sources)
    .slice(0, RESERVE_MAX)
    .map(([room]) => room);
}

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

  // Count WORKERS, not bodies. Reservers cannot harvest, haul, build or upgrade,
  // so counting them as population let the growth gate believe the colony was at
  // full strength while its actual workforce starved.
  const mine = Object.values(Game.creeps).filter(c => (c.memory.home ?? c.room.name) === room.name);
  const alive = mine.filter(c => c.memory.caste !== 'reserver').length;
  if (alive >= COLONY_MAX) return null;

  // Survival floor scales with target size, so a large colony reacts to decline
  // instead of waiting until it is nearly extinct. Declared here because the
  // reserver gate below also needs it.
  const survivalFloor = Math.ceil(COLONY_MAX * COLONY_MIN_FRACTION);

  // Reservers are a morphological caste — a [CLAIM, MOVE] body cannot harvest —
  // so they are spawned explicitly rather than emerging from thresholds. See
  // creep/tasks/reserve.ts for why this is the one deliberate exception.
  //
  // Gated behind a healthy workforce, and deliberately so. Reservers previously
  // spawned ahead of workers whenever 650 energy was available; with four rooms
  // to hold and a 600-tick reserver lifetime some room almost always wanted one,
  // so the spawn produced reservers instead of workers and the colony collapsed
  // to 5. A reservation is worthless if there is nobody left to forage the room
  // it protects.
  const workforceHealthy = alive >= Math.ceil(COLONY_MAX * RESERVE_WORKFORCE_FRACTION);
  if (
    RESERVE_ENABLED &&
    workforceHealthy &&
    alive >= survivalFloor &&
    energy.available >= RESERVER_COST
  ) {
    const targets = reservationTargets();
    const existing = Object.values(Game.creeps).filter(c => c.memory.caste === 'reserver');
    const unheld = targets.find(room => !existing.some(c => c.memory.remoteRoom === room));
    if (unheld) {
      const res = spawn.spawnCreep(RESERVER_BODY, `res_${Game.time}`, {
        memory: { caste: 'reserver', remoteRoom: unheld, home: room.name, taskState: {} },
      });
      if (res === OK) return 'reserver';
    }
  }

  const reason: SpawnReason = alive < survivalFloor ? 'survival' : 'growth';

  // Both paths stagger; only the interval differs. Survival used to skip the
  // stagger altogether, which rebuilt the population as one synchronised cohort
  // and guaranteed the next mass die-off a lifetime later.
  const stagger = reason === 'growth' ? SPAWN_STAGGER_TICKS : SURVIVAL_STAGGER_TICKS;
  const last = Memory.lastGrowthSpawn ?? -stagger;
  if (Game.time - last < stagger) return null;

  if (reason === 'growth') {
    // Absolute, not a share of capacity — see GROWTH_MIN_RESERVE.
    if (energy.available < GROWTH_MIN_RESERVE) return null;
  }

  const body = bodyFor(energy.available);
  if (!body) return null;

  const result = spawn.spawnCreep(body, `ant_${Game.time}`, {
    memory: {
      task: DEFAULT_TASK,
      ...breed(),
      taskState: {},
    },
  });

  // Track the last spawn of EITHER kind, so survival births stagger against
  // each other rather than only against growth births.
  if (result === OK) Memory.lastGrowthSpawn = Game.time;
  return result === OK ? reason : null;
}
