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

/** Energy actually delivered, per tick of life. */
export function fitnessOf(creep: Creep): number {
  const record = creep.memory.work;
  if (!record || record.ticks <= 0) return 0;
  return record.value / record.ticks;
}

/**
 * Called once per creep per tick. Accumulates **energy the creep actually
 * delivered**, which is what fitness now means.
 *
 * The previous definition was the bug that mattered most in this whole project.
 * It summed the *stimulus of the task being performed* whenever a caller passed
 * `productive = true` — so the objective function never mentioned energy at all.
 * It rewarded being busy at something the colony wanted. Two call sites in
 * `remote.ts` scored a creep as productive for walking home, and for arriving at
 * a full nest and depositing nothing; a forager that trekked out, came back,
 * delivered nothing and died full earned maximum fitness for its entire life.
 * ~7500 generations were selected under that, and best fitness sat frozen at
 * 0.9055 — an unbeatable busywork champion no honest creep could displace.
 *
 * Delivery is measured as **a decrease in the creep's own energy store**, not
 * self-reported by each task. That is deliberate: a store only falls when energy
 * leaves the creep, so this counts transfers to spawn, extensions and the
 * granary, upgrades to the controller, construction and repair — every delivery
 * path at once — and cannot be gamed by a call site passing the wrong flag.
 * Harvesting and withdrawing raise the store and are correctly worth nothing;
 * they are how a creep gets energy, not what it does with it.
 *
 * Intents resolve at the end of a tick, so the store read here reflects the
 * previous tick's action. Comparing consecutive reads therefore attributes each
 * delivery exactly once, one tick late — which does not matter for a lifetime
 * average.
 *
 * Reservers cannot deliver and would score zero, but they never enter the gene
 * pool: they spawn without a threshold profile and `retire` returns early
 * without one. The caste is safe by construction rather than by special case.
 */
export function recordWork(creep: Creep): void {
  const record = creep.memory.work ?? (creep.memory.work = { value: 0, ticks: 0 });
  record.ticks += 1;

  const carried = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  if (record.lastStore !== undefined && carried < record.lastStore) {
    record.value += record.lastStore - carried;
  }
  record.lastStore = carried;
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

/**
 * Where selection is actually taking the colony.
 *
 * `{generation, best, pooled}` cannot answer that: generation only counts
 * funerals, and a frozen `best` looks identical to healthy stasis. Observed
 * 2026-07-31 — best pinned at 0.9055 across every sample while generation
 * climbed past 7500, which was an unbeatable busywork champion, not convergence.
 *
 * Reported per gene: the pool mean, and the spread. **Spread is the diagnostic
 * that matters.** A mean drifting with a collapsing spread is genuine
 * convergence; a mean drifting with a wide spread is drift under weak selection;
 * a collapsed spread with a flat mean is a pool that has stopped exploring and
 * will not find anything new. Mean alone cannot distinguish these.
 */
export function evolutionTrajectory(): Record<string, number> {
  const p = pool();
  const out: Record<string, number> = {};
  if (p.genes.length === 0) return out;

  const fits = p.genes.map(g => g.fitness);
  out.fitMean = fits.reduce((a, b) => a + b, 0) / fits.length;
  out.fitWorst = fits[fits.length - 1];

  for (const task of TASK_NAMES) {
    const vals = p.genes.map(g => g.thresholds[task]).filter(v => typeof v === 'number');
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    out[`${task}Mean`] = Math.round(mean * 1000) / 1000;
    out[`${task}Spread`] =
      Math.round(Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length) * 1000) /
      1000;
  }

  for (const name of TRAIT_NAMES) {
    const vals = p.genes
      .map(g => (g.traits ?? ({} as TraitProfile))[name])
      .filter(v => typeof v === 'number');
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    out[`${name}Mean`] = Math.round(mean * 1000) / 1000;
  }

  return out;
}

/** Baseline spread, exported so config stays the single source for tuning. */
export const BASELINE = { base: THRESHOLD_BASE, jitter: THRESHOLD_JITTER };
