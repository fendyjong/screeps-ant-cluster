import { THRESHOLD_BASE, THRESHOLD_JITTER } from '../config';
import { TASK_NAMES, TaskName, ThresholdProfile } from '../types';

function jitteredThreshold(): number {
  return THRESHOLD_BASE + (Math.random() * 2 - 1) * THRESHOLD_JITTER;
}

/** A fresh profile: one independently jittered threshold per task. */
export function generateProfile(): ThresholdProfile {
  return {
    supply: jitteredThreshold(),
    upgrade: jitteredThreshold(),
    build: jitteredThreshold(),
    remote: jitteredThreshold(),
  };
}

function isValidProfile(p: unknown): p is ThresholdProfile {
  if (typeof p !== 'object' || p === null) return false;
  const rec = p as Record<string, unknown>;
  return TASK_NAMES.every(t => typeof rec[t] === 'number' && isFinite(rec[t] as number));
}

/**
 * Returns the creep's profile, regenerating and persisting a fresh one if it is
 * missing or corrupt. Never throws — a creep without a profile still acts.
 */
export function ensureProfile(creep: Creep): ThresholdProfile {
  const existing = creep.memory.thresholds;
  if (isValidProfile(existing)) return existing;

  // A profile missing only newly-added tasks is not corrupt — it predates them.
  // Patch the gaps instead of discarding, or adding a task would silently wipe
  // every living creep's inherited profile and undo generations of selection.
  if (existing && typeof existing === 'object') {
    const partial = existing as Partial<Record<TaskName, number>>;
    const salvaged = {} as ThresholdProfile;
    let hadAny = false;
    for (const task of TASK_NAMES) {
      const value = partial[task];
      if (typeof value === 'number' && isFinite(value)) {
        salvaged[task] = value;
        hadAny = true;
      } else {
        salvaged[task] = jitteredThreshold();
      }
    }
    if (hadAny) {
      creep.memory.thresholds = salvaged;
      return salvaged;
    }
  }

  const fresh = generateProfile();
  creep.memory.thresholds = fresh;
  return fresh;
}
