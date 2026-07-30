import { TaskName } from './types';

/**
 * Colony size is no longer a fixed target — it emerges from a growth stimulus.
 *
 * Real colonies regulate worker production by satiation feedback: full reserves
 * suppress recruitment, unmet needs attract labor, and negative feedback stops
 * overinvestment once a need is met. So we spawn only while energy reserves sit
 * satiated, which is the colony's signal that it can support more brood.
 *
 * The loop closes itself: spawning drains energy below the surplus ratio, so
 * growth pauses until foragers refill the reserve. If added creeps cost more
 * than they bring in, the ratio never recovers and growth stops on its own.
 */
/** Survival floor — always replace below this, regardless of reserves. */
export const COLONY_MIN = 2;

/**
 * Safety ceiling, so a runaway feedback loop cannot exhaust CPU.
 *
 * Raised 10 -> 25 to test whether satiation feedback is genuinely self-limiting.
 * At 10 the colony still held 300/300 energy, so the ceiling was the binding
 * constraint, not the stimulus — which left the central M2 claim unproven. With
 * headroom, sources (finite, 300-tick regen) and a fixed 300-energy reserve
 * should make added workers stop paying for themselves, dropping the surplus
 * ratio and halting growth on its own. If the colony instead pins at 25, the
 * feedback is NOT self-limiting and the model needs rethinking.
 */
export const COLONY_MAX = 25;

/**
 * Absolute energy the colony must hold before investing in a new worker.
 *
 * This was a ratio of capacity (0.95), which broke the moment the colony could
 * expand its own nest: capacity went 300 -> 550, so the gate silently rose from
 * 285 to 522 energy. Fewer workers refill more slowly, so the gate opened less
 * often, so fewer workers were born — a death spiral that took the colony from
 * 25 creeps to the survival floor of 2 within one generation.
 *
 * An absolute threshold does not move when the nest grows. At IDEAL_BODY_COST
 * the colony can afford a full-size worker and still hold a minimum body in
 * reserve, and a larger nest now means *more* headroom above the gate rather
 * than less.
 */
export const GROWTH_MIN_RESERVE = 400;

/**
 * Minimum ticks between *growth* spawns, so the population has a staggered age
 * structure instead of being one cohort.
 *
 * Observed 2026-07-30: the colony collapsed 24 -> 2 creeps in ~400 ticks and
 * then rebuilt, repeatedly. Nothing was wrong with the economy — the population
 * had grown as a single age-cohort, so it aged out together. Rebuilding as fast
 * as energy allowed simply recreated the cohort, making the oscillation
 * self-perpetuating. `upgrade` sat at zero through each trough, burning exactly
 * the GCL progress that gates expansion.
 *
 * CREEP_LIFE_TIME / COLONY_MAX = 1500 / 25 = 60 spreads births evenly across one
 * lifetime, which is what a steady-state age distribution requires. Survival
 * spawning below COLONY_MIN is deliberately exempt: a colony near death must
 * replace immediately, and real colonies likewise do not ration brood while
 * facing collapse.
 */
export const SPAWN_STAGGER_TICKS = 60;

/**
 * Quorum control. Real colonies avoid over-recruiting to one source because
 * arriving ants congest it — they collide, slow down, and some turn back. That
 * negative feedback caps recruitment at the productive level (research doc §4.3).
 *
 * Without it, a saturated stimulus recruits the entire colony. Observed at tick
 * 131800: 23 of 24 creeps piled onto `supply`, a task needing about two. Harmless
 * at four creeps, ruinous at twenty-five.
 *
 * Each creep already committed to a task divides that task's apparent intensity,
 * so the Nth worker sees a weaker signal than the first.
 */
export const CONGESTION_FACTOR = 0.35;

/**
 * How many creeps each task can absorb before it is genuinely crowded.
 * Congestion only applies to workers BEYOND this — arriving at an uncrowded
 * site costs nothing, which is how real congestion behaves.
 *
 * Damping by raw occupancy instead was actively harmful: at 25 creeps it divided
 * every stimulus by up to ~9, pushing all of them under every threshold, so no
 * creep ever saw a positive margin and the whole colony froze on whatever it
 * happened to hold. Observed with 5-12 creeps stranded on `build` while zero
 * construction sites existed.
 */
/** One spawn saturates after a couple of deliverers. */
export const CAPACITY_SUPPLY = 3;

/** A controller absorbs as many upgraders as the colony can field. */
export const CAPACITY_UPGRADE = 999;

/** Build capacity scales with actual sites — no sites means no capacity at all. */
export const CAPACITY_BUILD_PER_SITE = 2;

/**
 * Remote foraging capacity. Each remote source sustains 5 WORK parts
 * (SOURCE_ENERGY_NEUTRAL_CAPACITY 1500 / ENERGY_REGEN_TIME 300 / HARVEST_POWER 2),
 * so a handful of foragers per known source is the productive level.
 */
export const CAPACITY_REMOTE = 6;

/**
 * Remote foraging is DISABLED pending a redesign.
 *
 * The idea is sound and the measured need is real — the home room is hard-capped
 * at 20 energy/tick while the colony was fielding 7.4x the WORK it can use. The
 * implementation is not. Foragers ended up stuck: permanently in `gathering`
 * phase, carrying partial loads, parked on exit tiles. Two attempted fixes each
 * made things worse — narrowing the movement target did not stop the border
 * bouncing, and committing creeps to their trip locked the entire colony onto
 * remote, so nobody supplied the spawn and the population collapsed to 2.
 *
 * With this false, remote's stimulus is pinned at 0, so no creep ever chooses it
 * and any still carrying a load finishes and is released. The code and the
 * threshold axis stay in place, so the gene pool keeps its shape and the work is
 * not lost — this is a switch, not a revert.
 *
 * What a correct version needs, from the observed failures:
 *  - Movement that never leaves a creep resting on an exit tile (the engine
 *    teleports creeps off them, which is the bouncing).
 *  - A phase flip that triggers on "enough to be worth the trip", not only on a
 *    full store — foragers were stranded at 77/100 forever.
 *  - Commitment scoped to a single leg of the journey, never open-ended.
 */
export const REMOTE_ENABLED = true;

/**
 * Head home at this fraction of carry capacity rather than waiting to fill
 * completely. Foragers previously stalled at 77/100 forever because the shared
 * phase logic only released them on a totally full store.
 */
export const REMOTE_RETURN_FRACTION = 0.7;

/**
 * How long a homeward commitment lasts. Bounded on purpose: an open-ended
 * commitment locked every forager permanently and collapsed the colony. This
 * covers one leg of the trip and lapses by itself if anything goes wrong.
 */
export const REMOTE_COMMIT_TICKS = 300;

/**
 * Ceiling on the remote stimulus.
 *
 * Uncapped it reached 1.0 while the room was oversubscribed, which outbid every
 * other task at once and drew most of the colony out at the same moment. Held
 * just above `UPGRADE_BASELINE` it competes honestly for labor without being
 * able to monopolise it — a blast radius limit, not a tuning preference.
 */
export const REMOTE_MAX_STIMULUS = 0.55;

/**
 * WORK parts one home source sustains: SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME
 * / HARVEST_POWER = 3000/300/2. Beyond this, extra WORK in the home room is
 * simply idle, which is what makes remote foraging worth its travel overhead.
 */
export const WORK_PER_SOURCE = 5;

/**
 * Nest expansion (research doc §7.4: population controls nest area, not the
 * reverse). One extension per this many workers, capped by what the RCL allows.
 * At 25 creeps that asks for 9, against the 10 permitted at RCL 3.
 */
export const CREEPS_PER_EXTENSION = 3;

/**
 * Also grow the nest whenever reserves sit satiated, not only when population
 * demands it. Population alone left the colony at 9 extensions while RCL 4
 * permitted 20 — capacity capped body size, body size capped upgrade throughput,
 * and throughput is what gates expansion.
 *
 * A ratio is the right shape *here* even though it was wrong for the spawn gate:
 * it self-limits correctly, since each new extension makes staying satiated
 * harder, so nest growth slows as the nest grows.
 */
export const NEST_SATIATED_RATIO = 0.9;

/** Ticks between nest-planning passes. Placement is cheap but not free. */
export const NEST_PLAN_INTERVAL = 50;

/** How far from the spawn to look for a legal extension tile. */
export const NEST_SEARCH_RADIUS = 6;

/**
 * Trail pheromone and road crystallisation (research doc §11.3).
 *
 * Decay is what keeps a road meaning "currently useful" rather than "walked once":
 * without evaporation every tile ever stepped on eventually crosses the threshold
 * and the colony paves the entire room.
 */
export const TRAFFIC_DECAY = 0.85;
export const TRAFFIC_DECAY_INTERVAL = 100;
export const TRAFFIC_PRUNE_BELOW = 1;

/** Accumulated traffic before a tile is worth paving. */
export const ROAD_TRAFFIC_THRESHOLD = 60;

/** Ticks between road-planning passes. */
export const ROAD_PLAN_INTERVAL = 150;

/** Cap on outstanding sites, so builders are never swamped by the planner. */
export const ROAD_MAX_PENDING_SITES = 4;

/**
 * How many creeps may join any one task per tick — recruitment as a rate rather
 * than a step change.
 *
 * Without this, a stimulus crossing everyone's threshold at once moves the whole
 * colony in a single tick. Observed repeatedly: 23 of 24 creeps on `supply`
 * (tick 222500, 18 simultaneous `abandon` switches), 24 of 25 on `build`
 * (tick 222800). Congestion damping cannot prevent it, because occupancy is
 * sampled from the previous tick — every creep evaluates against a near-empty
 * task and commits before any of them counts as crowding.
 *
 * Real colonies cannot do this. Recruitment costs travel and physical contact,
 * and workers accelerate a transition rather than switching instantly, so labor
 * shifts over many time steps. Two per tick still fills an urgent task within a
 * few ticks (~40ms at this server's speed) while making mass migration
 * impossible.
 */
export const RECRUIT_LIMIT_PER_TICK = 2;

/**
 * Heredity (see evolution.ts). Creeps inherit thresholds from fitter dead
 * creeps, with mutation.
 *
 * The bounds are the "minimum boundaries" this design needs. Without a floor,
 * selection drives every threshold to 0 — a creep that always works scores
 * perfectly, and a colony of those stampedes every task at once. Without a
 * ceiling, profiles drift so high the creep never works. The bounds preserve
 * enough spread for the inactive-reserve caste to survive selection.
 */
export const THRESHOLD_MIN = 0.1;
export const THRESHOLD_MAX = 0.9;
export const MUTATION_RATE = 0.08;
export const GENE_POOL_SIZE = 20;

/**
 * Bump when the fitness function changes meaning. Scores are only comparable
 * within one definition: the previous version scored the *fraction of life spent
 * working* and routinely hit 1.0, while the current one scores *value delivered*
 * and tops out near the average stimulus. Mixing the two would let obsolete
 * genes outrank every new one forever and the change would silently never take
 * effect. On a version change the pool is discarded and re-earned.
 */
export const FITNESS_VERSION = 2;

/** GCL curve, verified against constants.js on disk. */
export const GCL_POW = 2.4;
export const GCL_MULTIPLY = 1000000;

/**
 * K — ticks between telemetry snapshots. Distinct from COLONY_SIZE.
 * The server runs at ~20ms/tick (~50 ticks/sec), so 10 emitted five snapshots a
 * second and swamped SigNoz. At 100 it is roughly one every two seconds, which
 * still resolves a 1500-tick creep generation (~30s) into ~15 samples.
 */
export const SNAPSHOT_INTERVAL = 100;

/** Threshold profiles are drawn from BASE ± JITTER, per task, at spawn. */
export const THRESHOLD_BASE = 0.5;
export const THRESHOLD_JITTER = 0.25;

/** A candidate task must beat the current one by this much to steal a creep. */
export const SWITCH_BUFFER = 0.15;

/** Per-creep, per-tick chance of switching regardless of margins. */
export const EXPLORATION_ENABLED = true;
export const EXPLORATION_CHANCE = 0.02;

/** DEBUG emits per creep per tick. Off unless actively investigating. */
export const DEBUG_LOGGING = false;

/** Prefixed to every telemetry line so the shipper can find our output. */
export const TELEMETRY_SENTINEL = '[ANT]';

/**
 * Cap on Memory.telemetry. Memory is serialized every tick, so this buffer must
 * stay small. At SNAPSHOT_INTERVAL=10 and ~0.8 ticks/sec, 60 records is roughly
 * 12 minutes of snapshots — far more than the ~10s db.json flush cadence needs.
 */
export const TELEMETRY_BUFFER_MAX = 60;

/** Cost of the minimum body — the affordability point where supply saturates. */
export const MIN_BODY_COST = 200;

/** The controller always wants energy, so upgrade has a constant baseline pull. */
export const UPGRADE_BASELINE = 0.5;

/** Construction sites needed to drive the build stimulus to 1.0. */
export const BUILD_SATURATION_SITES = 3;

/** Used when a creep has no task and nothing clears its thresholds. */
export const DEFAULT_TASK: TaskName = 'upgrade';

export const MIN_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE];
export const IDEAL_BODY: BodyPartConstant[] = [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
export const IDEAL_BODY_COST = 400;

/**
 * Bodies scale with available energy instead of stopping at a fixed template.
 *
 * `bodyFor` previously returned IDEAL_BODY (400 energy, 2 WORK) and never grew,
 * so the colony wasted every point of capacity above 400 — at 750 it was
 * spawning the same creep it spawned at 400. Since UPGRADE_CONTROLLER_POWER is
 * per WORK part, upgrade throughput scales linearly with WORK, and GCL — the
 * only gate on claiming a second room — comes solely from upgrading. Fixed-size
 * bodies were therefore throttling expansion directly.
 *
 * One [WORK, CARRY, MOVE] unit costs 200 and keeps a 1:1 MOVE ratio, so the
 * creep stays at full speed off-road. MAX_CREEP_SIZE is 50 parts, hence 16 units.
 */
export const BODY_UNIT_COST = 200;
export const MAX_BODY_UNITS = 16;

export const COLORS = {
  hud: '#c9c9c9',
  DEBUG: '#808080',
  INFO: '#00b300',
  WARN: '#ff9800',
  ERROR: '#e53935',
} as const;
