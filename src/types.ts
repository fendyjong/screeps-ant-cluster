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

declare global {
  interface CreepMemory {
    task?: TaskName;
    thresholds?: ThresholdProfile;
    taskState?: TaskState;
  }
}
