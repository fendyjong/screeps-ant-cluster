import { DEFAULT_TASK, EXPLORATION_ENABLED } from '../config';
import { Stimuli, TaskName, TASK_NAMES, ThresholdProfile, TraitProfile } from '../types';

export type SwitchReason = 'no-current' | 'abandon' | 'better' | 'explore' | 'stay';

export interface Decision {
  task: TaskName;
  switched: boolean;
  reason: SwitchReason;
  /** stimulus − threshold, per task. Carried so telemetry can explain a switch. */
  margins: Stimuli;
}

/**
 * Pure. `roll` is a uniform draw in [0, 1) supplied by the caller.
 *
 * Rules, in order:
 *  4. Exploration fires first: a small chance to switch regardless of margins.
 *     Deliberate, not noise — exploration is intentional in young colonies.
 *  1. Nothing positive: keep the current task, or DEFAULT_TASK if there is none.
 *  2. Current went negative: abandon it for the best positive task, no buffer.
 *  3. Current still positive: switch only if beaten by more than SWITCH_BUFFER.
 */
export function decide(
  stimuli: Stimuli,
  thresholds: ThresholdProfile,
  current: TaskName | undefined,
  roll: number,
  traits: TraitProfile,
): Decision {
  // These were global constants. They are now heritable per-creep traits, so a
  // badly-tuned value costs one creep its fitness instead of destabilising the
  // whole colony — and selection settles on a value rather than me guessing.
  const explorationChance = traits.explorationChance;
  const switchBuffer = traits.switchBuffer;
  const margins: Stimuli = {
    supply: stimuli.supply - thresholds.supply,
    upgrade: stimuli.upgrade - thresholds.upgrade,
    build: stimuli.build - thresholds.build,
    remote: stimuli.remote - thresholds.remote,
  };

  if (EXPLORATION_ENABLED && roll < explorationChance) {
    const others = TASK_NAMES.filter(t => t !== current);
    const index = Math.floor((roll / explorationChance) * others.length);
    const pick = others[Math.min(index, others.length - 1)];
    return { task: pick, switched: pick !== current, reason: 'explore', margins };
  }

  const best = TASK_NAMES.reduce((a, b) => (margins[b] > margins[a] ? b : a));

  if (current === undefined) {
    const task = margins[best] > 0 ? best : DEFAULT_TASK;
    return { task, switched: true, reason: 'no-current', margins };
  }

  if (margins[best] <= 0) {
    return { task: current, switched: false, reason: 'stay', margins };
  }

  if (margins[current] <= 0) {
    return { task: best, switched: best !== current, reason: 'abandon', margins };
  }

  if (margins[best] > margins[current] + switchBuffer) {
    return { task: best, switched: true, reason: 'better', margins };
  }

  return { task: current, switched: false, reason: 'stay', margins };
}
