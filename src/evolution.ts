import {
  GENE_POOL_SIZE,
  MUTATION_RATE,
  THRESHOLD_BASE,
  THRESHOLD_JITTER,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
} from './config';
import { TASK_NAMES, ThresholdProfile } from './types';
import { generateProfile } from './creep/thresholds';

/**
 * Heredity: a dying ant births a better ant.
 *
 * Until now every creep drew a fresh random threshold profile at birth, so
 * nothing accumulated — the colony re-rolled the same lottery forever and could
 * not get better at its own job. This closes the loop: creeps are scored while
 * they live, the best profiles are retained when they die, and new creeps
 * inherit from that pool with mutation.
 *
 * The three pieces a genetic algorithm needs:
 *  - **Fitness**: fraction of a creep's lifetime spent doing useful work rather
 *    than idling. Measured, not assumed — each task reports whether its action
 *    actually succeeded this tick.
 *  - **Selection**: fitness-weighted draw from a bounded pool of dead creeps'
 *    profiles, so good profiles breed more often without ever being the only
 *    option.
 *  - **Mutation**: gaussian-ish jitter on each threshold, so the pool keeps
 *    exploring instead of converging on its first lucky winner.
 *
 * **Minimum boundaries matter more than they look.** Thresholds are clamped to
 * [THRESHOLD_MIN, THRESHOLD_MAX]. Without a floor, selection drives every
 * threshold toward 0 — a creep that always works scores perfectly on this
 * fitness function, and a colony of them stampedes every task simultaneously,
 * which is exactly the pathology the recruitment limiter exists to prevent.
 * Without a ceiling, a profile can drift so high the creep never works at all
 * and becomes dead weight. The bounds keep the population diverse enough that
 * the inactive-reserve caste (§4.2.1) survives selection rather than being
 * optimised away.
 */

export interface Gene {
  thresholds: ThresholdProfile;
  fitness: number;
}

interface GenePool {
  genes: Gene[];
  generation: number;
}

function pool(): GenePool {
  const memory = Memory.evolution ?? (Memory.evolution = { genes: [], generation: 0 });
  if (!Array.isArray(memory.genes)) memory.genes = [];
  return memory as GenePool;
}

/** Fraction of ticks this creep spent actually working. */
export function fitnessOf(creep: Creep): number {
  const record = creep.memory.work;
  if (!record || record.ticks <= 0) return 0;
  return record.productive / record.ticks;
}

/** Called once per creep per tick with whether its action did something. */
export function recordWork(creep: Creep, productive: boolean): void {
  const record = creep.memory.work ?? (creep.memory.work = { productive: 0, ticks: 0 });
  record.ticks += 1;
  if (productive) record.productive += 1;
}

/**
 * Retires a dead creep's profile into the pool. Keeps only the fittest
 * GENE_POOL_SIZE, so Memory stays bounded and selection pressure is real.
 */
export function retire(thresholds: ThresholdProfile | undefined, fitness: number): void {
  if (!thresholds) return;
  const p = pool();
  p.genes.push({ thresholds, fitness });
  p.genes.sort((a, b) => b.fitness - a.fitness);
  if (p.genes.length > GENE_POOL_SIZE) p.genes.length = GENE_POOL_SIZE;
  p.generation += 1;
}

function clamp(value: number): number {
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, value));
}

function mutate(parent: ThresholdProfile): ThresholdProfile {
  const child = {} as ThresholdProfile;
  for (const task of TASK_NAMES) {
    const drift = (Math.random() * 2 - 1) * MUTATION_RATE;
    child[task] = clamp(parent[task] + drift);
  }
  return child;
}

/**
 * A profile for a new creep: inherited from a fitness-weighted parent when the
 * pool has learned anything, otherwise a fresh random draw.
 */
export function breed(): ThresholdProfile {
  const p = pool();
  const viable = p.genes.filter(g => g.fitness > 0);
  if (viable.length === 0) {
    // Nothing has proven itself yet — random draw, clamped to the same bounds so
    // the first generation cannot start outside the legal range.
    const fresh = generateProfile();
    for (const task of TASK_NAMES) fresh[task] = clamp(fresh[task]);
    return fresh;
  }

  const total = viable.reduce((sum, g) => sum + g.fitness, 0);
  let roll = Math.random() * total;
  for (const gene of viable) {
    roll -= gene.fitness;
    if (roll <= 0) return mutate(gene.thresholds);
  }
  return mutate(viable[0].thresholds);
}

export function evolutionStats(): { generation: number; best: number; pooled: number } {
  const p = pool();
  return {
    generation: p.generation,
    best: p.genes.length > 0 ? p.genes[0].fitness : 0,
    pooled: p.genes.length,
  };
}

/** Baseline spread, exported so config stays the single source for tuning. */
export const BASELINE = { base: THRESHOLD_BASE, jitter: THRESHOLD_JITTER };
