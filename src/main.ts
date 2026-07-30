import { runSpawning } from './spawn/respawn';
import { computeStimuli, readEnergy, readRoom } from './creep/stimuli';
import { decide } from './creep/decide';
import { ensureProfile } from './creep/thresholds';
import { run as runBuild } from './creep/tasks/build';
import { run as runSupply } from './creep/tasks/supply';
import { run as runUpgrade } from './creep/tasks/upgrade';
import { MIN_BODY_COST, SNAPSHOT_INTERVAL } from './config';
import { drawCreepLabels } from './visuals';
import { emit, emitSnapshot, TaskDistribution } from './telemetry';
import { TaskName } from './types';

const RUNNERS: Record<TaskName, (creep: Creep) => void> = {
  supply: runSupply,
  upgrade: runUpgrade,
  build: runBuild,
};

function distributionTotal(d: TaskDistribution): number {
  return d.supply + d.upgrade + d.build;
}

/** Drops memory for creeps that no longer exist, so it cannot grow unbounded. */
function pruneCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
}

function runRoom(room: Room): void {
  const energy = readEnergy(room);
  const stimuli = computeStimuli(readRoom(room));
  const distribution: TaskDistribution = { supply: 0, upgrade: 0, build: 0 };

  for (const creep of room.find(FIND_MY_CREEPS)) {
    // One creep throwing must not cost every other creep its tick.
    try {
      const thresholds = ensureProfile(creep);
      const previous = creep.memory.task;
      const decision = decide(stimuli, thresholds, previous, Math.random());

      if (decision.switched) {
        // A new task starts with a clean slate — the old target is meaningless.
        creep.memory.taskState = {};
        emit('INFO', 'task-switch', {
          creep: creep.name,
          from: previous ?? null,
          to: decision.task,
          reason: decision.reason,
          margins: decision.margins,
        });
      }

      creep.memory.task = decision.task;
      distribution[decision.task] += 1;

      emit('DEBUG', 'decision', {
        creep: creep.name,
        task: decision.task,
        reason: decision.reason,
        thresholds,
        margins: decision.margins,
      });

      RUNNERS[decision.task](creep);
    } catch (err) {
      emit('ERROR', 'creep-exception', {
        creep: creep.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const spawned = runSpawning(room, energy);
  if (spawned) {
    emit('INFO', 'spawn', { room: room.name, reason: spawned, alive: distributionTotal(distribution) });
  }

  // Colony death: nothing alive, nothing being born, and not enough energy to
  // start one. All three must hold — a creep mid-spawn means the colony is
  // recovering, not dead. A legitimate experimental result about threshold
  // tuning, but it must be loud rather than discovered hours later. Throttled to
  // the snapshot cadence, since once true it stays true every tick.
  const alive = room.find(FIND_MY_CREEPS).length;
  const spawnBusy = room.find(FIND_MY_SPAWNS).some(s => s.spawning !== null);
  if (
    alive === 0 &&
    !spawnBusy &&
    energy.available < MIN_BODY_COST &&
    Game.time % SNAPSHOT_INTERVAL === 0
  ) {
    emit('ERROR', 'colony-starvation', {
      room: room.name,
      energyAvailable: energy.available,
    });
  }

  drawCreepLabels(room);

  if (Game.time % SNAPSHOT_INTERVAL === 0) {
    emitSnapshot(room, stimuli, distribution, energy);
  }
}

export function loop(): void {
  pruneCreepMemory();

  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) {
      runRoom(room);
    }
  }
}
