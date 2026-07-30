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
 * Nest expansion (research doc §7.4: population controls nest area, not the
 * reverse). One extension per this many workers, capped by what the RCL allows.
 * At 25 creeps that asks for 9, against the 10 permitted at RCL 3.
 */
export const CREEPS_PER_EXTENSION = 3;

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

export const COLORS = {
  hud: '#c9c9c9',
  DEBUG: '#808080',
  INFO: '#00b300',
  WARN: '#ff9800',
  ERROR: '#e53935',
} as const;
