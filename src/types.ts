export type TaskName = 'supply' | 'upgrade' | 'build';

export const TASK_NAMES: TaskName[] = ['supply', 'upgrade', 'build'];

/** Per-task stimulus intensity, each normalized to 0..1. */
export type Stimuli = Record<TaskName, number>;

/** Per-creep response thresholds, one per task. */
export type ThresholdProfile = Record<TaskName, number>;

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
    taskState?: TaskState;
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
  }
}
