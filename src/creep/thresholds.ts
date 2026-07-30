import { THRESHOLD_BASE, THRESHOLD_JITTER } from '../config';
import { TASK_NAMES, ThresholdProfile } from '../types';

function jitteredThreshold(): number {
  return THRESHOLD_BASE + (Math.random() * 2 - 1) * THRESHOLD_JITTER;
}

/** A fresh profile: one independently jittered threshold per task. */
export function generateProfile(): ThresholdProfile {
  return {
    supply: jitteredThreshold(),
    upgrade: jitteredThreshold(),
    build: jitteredThreshold(),
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
  const fresh = generateProfile();
  creep.memory.thresholds = fresh;
  return fresh;
}
