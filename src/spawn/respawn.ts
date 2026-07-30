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
  PRESPAWN_TRAVEL_TICKS,
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
 * Rooms worth reserving: ones foraging is *actually working*, holding sources,
 * and not hostile.
 *
 * The qualifying evidence used to be "seen", which is far too weak — a creep
 * merely passing through a room recorded it, so the colony reserved rooms nobody
 * harvested. Measured cost of that mistake: **929 reserver spawns at 1250 energy
 * each, 1,161,250 energy — 59% of everything the colony had ever delivered to
 * its controller** — while the single live reserver held W5N7, whose source sat
 * untouched at 3000/3000 because foragers only ever visited W5N8 and W4N8.
 *
 * The economics are unforgiving and worth stating precisely, because they are
 * what makes "seen" so expensive. Reservation raises a remote source from
 * `SOURCE_ENERGY_NEUTRAL_CAPACITY` 1500 to `SOURCE_ENERGY_CAPACITY` 3000 per
 * 300-tick cycle — 5 energy/tick to 10, so **+5 energy/tick**. A
 * [CLAIM, CLAIM, MOVE] reserver costs 1250 and lives `CREEP_CLAIM_LIFE_TIME`
 * 600 ticks, so holding one costs **2.08 energy/tick**. On a room being
 * foraged that is strongly profitable; on a room nobody visits it is a pure
 * 2.08/tick loss, and four of them cost 8.33/tick against a colony delivering
 * 1.85/tick to its controller.
 *
 * The freshness window is one `CREEP_LIFE_TIME`. A room under active foraging is
 * harvested far more often than that, and an abandoned one exceeds it quickly,
 * so the threshold sits well inside the range the quantity actually takes rather
 * than at an unreachable edge.
 */
export function reservationTargets(): string[] {
  const intel = Memory.remotes ?? {};
  const home = Object.keys(Game.rooms).filter(r => Game.rooms[r].controller?.my);
  return Object.entries(intel)
    .filter(
      ([room, v]) =>
        !home.includes(room) &&
        v.sources > 0 &&
        !v.hostile &&
        v.lastHarvest !== undefined &&
        Game.time - v.lastHarvest < CREEP_LIFE_TIME,
    )
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
/**
 * Records why a tick produced no creep. Diagnostic only — three separate
 * collapses have now been attributed to the wrong cause and fixed without
 * stopping them, so the next one gets evidence instead of a hypothesis. Every
 * `return null` below is a distinct reason the colony declined to reproduce.
 */
function block(reason: string): null {
  const counts = Memory.spawnBlocks ?? (Memory.spawnBlocks = {});
  counts[reason] = (counts[reason] ?? 0) + 1;
  return null;
}

export function runSpawning(
  room: Room,
  energy: { available: number; capacity: number },
): SpawnReason | null {
  const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
  if (!spawn) return block('spawn-busy');

  // Count WORKERS, not bodies. Reservers cannot harvest, haul, build or upgrade,
  // so counting them as population let the growth gate believe the colony was at
  // full strength while its actual workforce starved.
  const mine = Object.values(Game.creeps).filter(c => (c.memory.home ?? c.room.name) === room.name);

  // "Alive" means *still alive by the time a replacement could reach the work* —
  // not merely breathing right now.
  //
  // Replacing a creep only after it dies guarantees a gap: the colony notices at
  // TTL 0, then spends ~36 ticks spawning a full body and another ~15 walking it
  // out, so every death costs about fifty creep-ticks of missing labour. Worse,
  // it makes replacement *reactive*, which is what let a synchronised die-off
  // outrun the spawn: 11 deaths inside 100 ticks against a spawn that produces
  // one creep at a time.
  //
  // Counting a nearly-dead creep as already gone fixes both without a new branch
  // and without letting the population exceed its cap. A creep inside its final
  // lead time stops counting, a deficit of one appears, and the ordinary growth
  // path spawns the successor so it matures just as its predecessor expires.
  // Population stops sawtoothing between 24 and 25 and simply sits at 25.
  //
  // It also composes with the deficit-scaled stagger rather than fighting it: one
  // creep dying is a deficit of one and keeps the full 60-tick spread, while a
  // cohort entering its last ticks together produces a large deficit and
  // near-continuous spawning, which is exactly the intended response.
  //
  // `ticksToLive` is undefined while a creep is still being spawned; that is a
  // creep about to start its life, so it counts.
  const leadTime = MAX_BODY_UNITS * BODY_UNIT.length * CREEP_SPAWN_TIME + PRESPAWN_TRAVEL_TICKS;
  const alive = mine.filter(
    c =>
      c.memory.caste !== 'reserver' &&
      (c.ticksToLive === undefined || c.ticksToLive > leadTime),
  ).length;
  if (alive >= COLONY_MAX) return block('at-cap');

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
  // Stagger scales with how far below strength the colony is.
  //
  // A fixed 60-tick gap was measured killing the colony outright. Spawn-block
  // telemetry across a collapse (tick 813800-814300):
  //
  //   creeps 25 -> 20 -> 15 -> 10 -> 7 -> 3 in ~500 ticks
  //   blocker through the entire fall: stagger-growth (28, 44, 48 ticks per 100)
  //   too-poor: 0 until the very bottom, once the foragers were already dead
  //
  // Replacing 25 losses at one per 60 ticks needs 1500 ticks; they died in 500.
  // The rule that exists to prevent cohorts also forbade recovering from one, so
  // every die-off ran all the way to the floor. Energy was a consequence of the
  // crash, never its cause — which is why three earlier diagnoses that read the
  // bottom of the crash were all wrong.
  //
  // Dividing by the deficit keeps the original purpose intact where it matters
  // and drops it where it is lethal. One creep short is ordinary turnover and
  // still spreads births across a lifetime (60 ticks); fifteen short is an
  // emergency and spawns near-continuously (4 ticks). No new threshold is
  // introduced, so there is no edge to get wrong: the deficit spans 1..COLONY_MAX
  // and the stagger spans 60..2 ticks, saturating harmlessly because a 6-part
  // body already occupies the spawn for ~18 ticks. Past that point `spawn-busy`
  // is the limit, which is a physical constraint rather than a policy one.
  const deficit = Math.max(1, COLONY_MAX - alive);
  const base = reason === 'growth' ? SPAWN_STAGGER_TICKS : SURVIVAL_STAGGER_TICKS;
  const stagger = Math.ceil(base / deficit);
  const last = Memory.lastGrowthSpawn ?? -stagger;
  if (Game.time - last < stagger) return block(`stagger-${reason}`);

  if (reason === 'growth') {
    // The reserve requirement relaxes as the colony falls further behind.
    //
    // `GROWTH_MIN_RESERVE` exists to stop the colony investing in an extra worker
    // it cannot afford. But with a fixed `COLONY_MAX`, genuine growth barely
    // happens — almost every spawn is *replacing* a creep that died. Gating
    // replacement behind a growth reserve is a category error, and telemetry
    // caught it doing real damage during a die-off (ticks 901600-901800):
    //
    //   creeps 17 -> 12 -> 4, blocked by growth-reserve for 9, 28 then 45 ticks
    //   per 100, while `too-poor` was still 0 — the colony could afford a creep
    //   and refused to build one because it was saving for a rainy day during
    //   the storm.
    //
    // Scaling by the deficit keeps the gate where it belongs and removes it where
    // it is lethal, exactly as the stagger above does. One short is ordinary
    // turnover and still demands the full 400. Eight short demands 50, which the
    // colony had. `bodyFor` already scales the body to what is affordable, so
    // `too-poor` remains the real floor and this gate stops pre-empting it.
    //
    // Range: `energy.available` spans 0-1800 and the requirement spans 400 down
    // to 16, so the threshold stays inside the range at every deficit rather than
    // becoming unreachable at either end.
    const required = Math.ceil(GROWTH_MIN_RESERVE / deficit);
    if (energy.available < required) return block('growth-reserve');
  }

  const body = bodyFor(energy.available);
  if (!body) return block('too-poor');

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
  return result === OK ? reason : block(`spawn-err-${result}`);
}
