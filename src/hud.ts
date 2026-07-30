import { COLONY_MAX, COLORS, GCL_MULTIPLY, GCL_POW } from './config';
import { Stimuli, TaskName, TASK_NAMES } from './types';
import { TaskDistribution } from './telemetry';

/**
 * Colony overview panel.
 *
 * The per-creep task labels answer "what is this creep doing"; this answers
 * "how is the colony doing" — the state you actually want when deciding what to
 * change next. Everything shown here is read from live game state rather than
 * recomputed, so the panel cannot drift from what the colony believes.
 */

const PANEL_X = 0.5;
const PANEL_Y = 1;
const LINE = 0.85;

/** GCL level from raw progress. Formula verified against constants.js on disk. */
export function gclLevel(progress: number): number {
  return Math.floor(Math.pow(progress / GCL_MULTIPLY, 1 / GCL_POW)) + 1;
}

/** Progress toward the next GCL, 0..1 — the gate on claiming another room. */
export function gclFraction(progress: number): number {
  const level = gclLevel(progress);
  const needed = Math.pow(level, GCL_POW) * GCL_MULTIPLY;
  return Math.min(1, progress / needed);
}

function bar(fraction: number, width = 10): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return '[' + '='.repeat(filled) + '.'.repeat(width - filled) + ']';
}

export interface HudState {
  distribution: TaskDistribution;
  stimuli: Stimuli;
  energy: { available: number; capacity: number };
  deferred: number;
  generation: number;
  bestFitness: number;
}

export function drawColonyHud(room: Room, state: HudState): void {
  const vis = room.visual;
  const creeps = room.find(FIND_MY_CREEPS);
  const controller = room.controller;

  const extensions = room
    .find(FIND_STRUCTURES)
    .filter(s => s.structureType === STRUCTURE_EXTENSION).length;
  const roads = room.find(FIND_STRUCTURES).filter(s => s.structureType === STRUCTURE_ROAD).length;
  const sites = room.find(FIND_CONSTRUCTION_SITES).length;

  const work = creeps.reduce(
    (sum, c) => sum + c.body.filter(part => part.type === WORK).length,
    0,
  );

  const gcl = Game.gcl;
  const lines: Array<[string, string]> = [
    [`${room.name}  RCL ${controller?.level ?? 0}`, COLORS.hud],
  ];

  if (controller && controller.progressTotal) {
    lines.push([
      `  RCL  ${bar(controller.progress / controller.progressTotal)} ${Math.floor(
        (controller.progress / controller.progressTotal) * 100,
      )}%`,
      COLORS.INFO,
    ]);
  }

  // GCL is the sole gate on claiming a second room, so it earns a place here.
  lines.push([
    `  GCL ${gcl.level} ${bar(gcl.progress / gcl.progressTotal)} ${Math.floor(
      (gcl.progress / gcl.progressTotal) * 100,
    )}%`,
    gcl.level > 1 ? COLORS.INFO : COLORS.WARN,
  ]);

  const energyFraction =
    state.energy.capacity > 0 ? state.energy.available / state.energy.capacity : 0;
  lines.push([
    `  energy ${bar(energyFraction)} ${state.energy.available}/${state.energy.capacity}`,
    energyFraction < 0.3 ? COLORS.WARN : COLORS.hud,
  ]);

  lines.push([`  creeps ${creeps.length}/${COLONY_MAX}   WORK ${work}`, COLORS.hud]);

  for (const task of TASK_NAMES) {
    const count = state.distribution[task as TaskName];
    const stim = state.stimuli[task as TaskName];
    lines.push([
      `   ${task.padEnd(8)} ${String(count).padStart(2)}  stim ${stim.toFixed(2)}`,
      count > 0 ? COLORS.hud : COLORS.DEBUG,
    ]);
  }

  lines.push([`  nest  ext ${extensions}  roads ${roads}  sites ${sites}`, COLORS.hud]);
  lines.push([
    `  evo   gen ${state.generation}  best ${(state.bestFitness * 100).toFixed(0)}%`,
    COLORS.hud,
  ]);

  if (state.deferred > 0) {
    lines.push([`  recruit deferred ${state.deferred}`, COLORS.WARN]);
  }

  lines.forEach(([text, color], i) => {
    vis.text(text, PANEL_X, PANEL_Y + i * LINE, {
      color,
      font: 0.55,
      align: 'left',
      opacity: 0.85,
    });
  });
}
