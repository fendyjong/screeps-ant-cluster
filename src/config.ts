import { TaskName } from './types';

/** N — target creep count per room. */
export const COLONY_SIZE = 4;

/** K — ticks between telemetry snapshots. Distinct from COLONY_SIZE. */
export const SNAPSHOT_INTERVAL = 10;

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
