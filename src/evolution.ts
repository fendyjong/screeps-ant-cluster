import {
  FITNESS_VERSION,
  GENE_POOL_SIZE,
  MUTATION_RATE,
  TRAIT_BOUNDS,
  THRESHOLD_BASE,
  THRESHOLD_JITTER,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
} from './config';
import { TASK_NAMES, ThresholdProfile, TraitProfile, TRAIT_NAMES } from './types';
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
 *  - **Fitness**: value delivered per tick of life. Each unit of work is weighted
 *    by how badly the colony needed that task at the moment it happened, so a
 *    creep hauling during an energy crisis outscores one upgrading a controller
 *    that was never starved.
 *
 *    An earlier version scored the raw *fraction of life spent working*, which
 *    rewarded task availability rather than task value: `upgrade` always has
 *    work, so always-upgraders scored a perfect 1.0 no matter what the colony
 *    actually needed, and the pool bred toward a monoculture of upgraders. The
 *    weighting is what makes selection track usefulness instead of busyness.
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

function clamp(value: number): number {
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, value));
}

export interface Gene {
  thresholds: ThresholdProfile;
  traits: TraitProfile;
  fitness: number;
}

function clampTrait(name: keyof TraitProfile, value: number): number {
  const bounds = TRAIT_BOUNDS[name];
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

/** A trait drawn uniformly across its legal range — no prior, selection decides. */
function randomTrait(name: keyof TraitProfile): number {
  const b = TRAIT_BOUNDS[name];
  return b.min + Math.random() * (b.max - b.min);
}

export function generateTraits(): TraitProfile {
  return {
    switchBuffer: randomTrait('switchBuffer'),
    explorationChance: randomTrait('explorationChance'),
    returnFraction: randomTrait('returnFraction'),
  };
}

/** Patches any missing trait, so widening the genome never discards a profile. */
export function ensureTraits(creep: Creep): TraitProfile {
  const existing = creep.memory.traits as Partial<TraitProfile> | undefined;
  const out = {} as TraitProfile;
  for (const name of TRAIT_NAMES) {
    const v = existing?.[name];
    out[name] = typeof v === 'number' && isFinite(v) ? clampTrait(name, v) : randomTrait(name);
  }
  creep.memory.traits = out;
  return out;
}

interface GenePool {
  genes: Gene[];
  generation: number;
}

function pool(): GenePool {
  const memory =
    Memory.evolution ?? (Memory.evolution = { genes: [], generation: 0, version: FITNESS_VERSION });
  if (!Array.isArray(memory.genes)) memory.genes = [];

  // Scores are only comparable within one fitness definition. Carrying genes
  // across a redefinition would let obsolete high scores outrank every honestly
  // scored newcomer, and the new function would never actually take effect.
  if (memory.version !== FITNESS_VERSION) {
    memory.genes = [];
    memory.version = FITNESS_VERSION;
  }

  // Adding a task widens the profile without invalidating fitness — the scores
  // still mean what they meant — so the pool is migrated rather than discarded,
  // preserving every generation of accumulated selection.
  //
  // The new axis is seeded UNIFORMLY AT RANDOM across the legal range, not
  // derived from an existing threshold. An earlier version seeded it from the
  // gene's `supply` value on the reasoning that remote foraging is also a
  // gathering task — but that is my assumption about what the task resembles,
  // baked in as a prior the colony can never argue with. Spreading the seed
  // across the whole range asserts nothing and lets selection discover the
  // right value, which is the entire point of having selection.
  for (const gene of memory.genes) {
    for (const task of TASK_NAMES) {
      const value = gene.thresholds[task];
      if (typeof value !== 'number' || !isFinite(value)) {
        gene.thresholds[task] =
          THRESHOLD_MIN + Math.random() * (THRESHOLD_MAX - THRESHOLD_MIN);
      }
    }
    // Same treatment for the trait genes added later: seed uniformly at random
    // rather than from any existing value, so no assumption of mine is baked in.
    const traits = (gene.traits ?? {}) as Partial<TraitProfile>;
    const filled = {} as TraitProfile;
    for (const name of TRAIT_NAMES) {
      const v = traits[name];
      filled[name] = typeof v === 'number' && isFinite(v) ? clampTrait(name, v) : randomTrait(name);
    }
    gene.traits = filled;
  }

  return memory as GenePool;
}

/** Value delivered per tick of life. */
export function fitnessOf(creep: Creep): number {
  const record = creep.memory.work;
  if (!record || record.ticks <= 0) return 0;
  return record.value / record.ticks;
}

/**
 * Called once per creep per tick.
 *
 * `value` is the colony's raw need for the task being performed — the undamped
 * stimulus. Undamped on purpose: congestion damping describes how crowded a task
 * is, not how much the work mattered, and a creep should not be penalised for
 * helping with something genuinely urgent just because others helped too.
 *
 * Idle ticks contribute nothing, which is what punishes a builder standing
 * around with no site to work.
 */
export function recordWork(creep: Creep, productive: boolean, value: number): void {
  const record = creep.memory.work ?? (creep.memory.work = { value: 0, ticks: 0 });
  record.ticks += 1;
  if (productive) record.value += value;
}

/**
 * Retires a dead creep's profile into the pool. Keeps only the fittest
 * GENE_POOL_SIZE, so Memory stays bounded and selection pressure is real.
 */
export function retire(
  thresholds: ThresholdProfile | undefined,
  traits: TraitProfile | undefined,
  fitness: number,
): void {
  if (!thresholds) return;
  const p = pool();
  p.genes.push({ thresholds, traits: traits ?? generateTraits(), fitness });
  p.genes.sort((a, b) => b.fitness - a.fitness);
  if (p.genes.length > GENE_POOL_SIZE) p.genes.length = GENE_POOL_SIZE;
  p.generation += 1;
}

function mutate(parent: ThresholdProfile): ThresholdProfile {
  const child = {} as ThresholdProfile;
  for (const task of TASK_NAMES) {
    const drift = (Math.random() * 2 - 1) * MUTATION_RATE;
    child[task] = clamp(parent[task] + drift);
  }
  return child;
}

/** Traits mutate proportionally to their own range, so each drifts at its own scale. */
function mutateTraits(parent: TraitProfile): TraitProfile {
  const child = {} as TraitProfile;
  for (const name of TRAIT_NAMES) {
    const b = TRAIT_BOUNDS[name];
    const drift = (Math.random() * 2 - 1) * MUTATION_RATE * (b.max - b.min);
    child[name] = clampTrait(name, parent[name] + drift);
  }
  return child;
}

/**
 * A profile for a new creep: inherited from a fitness-weighted parent when the
 * pool has learned anything, otherwise a fresh random draw.
 */
export function breed(): { thresholds: ThresholdProfile; traits: TraitProfile } {
  const p = pool();
  const viable = p.genes.filter(g => g.fitness > 0);
  if (viable.length === 0) {
    // Nothing has proven itself yet — random draw, clamped to the same bounds so
    // the first generation cannot start outside the legal range.
    const fresh = generateProfile();
    for (const task of TASK_NAMES) fresh[task] = clamp(fresh[task]);
    return { thresholds: fresh, traits: generateTraits() };
  }

  const total = viable.reduce((sum, g) => sum + g.fitness, 0);
  let roll = Math.random() * total;
  for (const gene of viable) {
    roll -= gene.fitness;
    if (roll <= 0) {
      return { thresholds: mutate(gene.thresholds), traits: mutateTraits(gene.traits) };
    }
  }
  return { thresholds: mutate(viable[0].thresholds), traits: mutateTraits(viable[0].traits) };
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
