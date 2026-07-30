export type TaskName = 'supply' | 'upgrade' | 'build' | 'remote';

export const TASK_NAMES: TaskName[] = ['supply', 'upgrade', 'build', 'remote'];

/** Per-task stimulus intensity, each normalized to 0..1. */
export type Stimuli = Record<TaskName, number>;

/** Per-creep response thresholds, one per task. */
export type ThresholdProfile = Record<TaskName, number>;

/**
 * Heritable behavioural traits — the constants the colony tunes for itself.
 *
 * These were global hand-picked constants, and hand-picking them went badly:
 * several colony collapses this session traced to a global value being wrong.
 * As genes they are per-creep, so a bad value harms only its bearer and is bred
 * out, rather than being imposed on everyone at once. Each also has a real
 * analogue in individual ant variation.
 */
export interface TraitProfile {
  /** How much better another task must look before switching. Decisiveness. */
  switchBuffer: number;
  /** Chance per tick of trying something else regardless of margins. Curiosity. */
  explorationChance: number;
  /** Fraction of carry capacity to fill before hauling home from a remote room. */
  returnFraction: number;
}

export const TRAIT_NAMES: Array<keyof TraitProfile> = [
  'switchBuffer',
  'explorationChance',
  'returnFraction',
];

export type TaskPhase = 'gathering' | 'delivering';

export interface TaskState {
  /** Source while gathering; the delivery target while delivering. */
  targetId?: string;
  phase?: TaskPhase;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/** One emitted telemetry line, buffered in Memory for the external shipper. */
export interface TelemetryRecord {
  tick: number;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

declare global {
  interface CreepMemory {
    task?: TaskName;
    thresholds?: ThresholdProfile;
    traits?: TraitProfile;
    taskState?: TaskState;
    /**
     * Lifetime work record. `value` accumulates the colony's need for the task
     * at the moment each unit of work happened, so scarce-but-critical work
     * outweighs abundant busywork.
     */
    work?: { value: number; ticks: number; lastStore?: number };

    /** Room this creep calls home, for remote foraging round trips. */
    home?: string;

    /** Room it is currently foraging, remembered so it does not oscillate at
     *  the border. */
    remoteRoom?: string;

    /** Marks a morphological caste: a [CLAIM, MOVE] body cannot do normal work. */
    caste?: 'reserver';

    /** Expiry tick of a homeward commitment. Bounded so it cannot lock a creep
     *  permanently, which previously collapsed the colony. */
    commitUntil?: number;
  }

  interface Memory {
    /**
     * Bounded ring buffer of recent telemetry. Exists because this private
     * server is Steam-launched: console output goes to the launcher's stdout,
     * which no external process can tail. Memory reaches disk via the server's
     * db.json instead, so that is the escape route.
     */
    telemetry?: TelemetryRecord[];

    /**
     * Sparse per-room trail pheromone: only tiles creeps actually walked, keyed
     * "x,y". Sparse and pruned on purpose — Memory is serialized every tick, so
     * a dense 50x50 grid per room would be 2500 entries of pure overhead.
     */
    traffic?: Record<string, Record<string, number>>;

    /** What has been seen of neighbouring rooms, built up by foragers. */
    spawnBlocks?: Record<string, number>;
    remotes?: Record<
      string,
      { sources: number; hostile: boolean; lastSeen: number; lastHarvest?: number }
    >;

    /** Tick of the last growth spawn, used to stagger the population's ages. */
    lastGrowthSpawn?: number;

    /** Gene pool of retired creeps' threshold profiles, best-first. */
    evolution?: {
      genes: Array<{ thresholds: ThresholdProfile; traits?: TraitProfile; fitness: number }>;
      generation: number;
      version?: number;
    };
  }
}
