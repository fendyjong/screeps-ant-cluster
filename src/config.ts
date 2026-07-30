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

/** Reserves must be at least this full before the colony invests in growth. */
export const GROWTH_SURPLUS_RATIO = 0.95;

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
