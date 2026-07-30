import { decayTraffic, depositTraffic, proposeRoads } from './pheromone';
import { runNestExpansion, runStoragePlan } from './spawn/nest';
import { runSpawning } from './spawn/respawn';
import { applyCongestion, computeStimuli, readEnergy, readRoom } from './creep/stimuli';
import { decide } from './creep/decide';
import { ensureProfile } from './creep/thresholds';
import { run as runBuild } from './creep/tasks/build';
import { run as runRemote } from './creep/tasks/remote';
import { isReserver, run as runReserve } from './creep/tasks/reserve';
import { run as runSupply } from './creep/tasks/supply';
import { run as runUpgrade } from './creep/tasks/upgrade';
import { MIN_BODY_COST, RECRUIT_LIMIT_PER_TICK, REMOTE_ENABLED, SNAPSHOT_INTERVAL } from './config';
import { drawColonyHud } from './hud';
import { ensureTraits, evolutionStats, evolutionTrajectory, fitnessOf, retire } from './evolution';
import { drawCreepLabels } from './visuals';
import { emit, emitSnapshot, TaskDistribution } from './telemetry';
import { TaskName } from './types';

const RUNNERS: Record<TaskName, (creep: Creep, value: number) => void> = {
  supply: runSupply,
  upgrade: runUpgrade,
  build: runBuild,
  remote: runRemote,
};

function distributionTotal(d: TaskDistribution): number {
  return d.supply + d.upgrade + d.build + d.remote;
}

/** Drops memory for creeps that no longer exist, so it cannot grow unbounded. */
function pruneCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      // Heredity: a dying creep's profile enters the gene pool scored by how
      // much of its life it spent working. This is the only moment the
      // information exists — after the delete it is gone forever.
      const memory = Memory.creeps[name];
      const record = memory.work;
      const fitness = record && record.ticks > 0 ? record.value / record.ticks : 0;
      retire(memory.thresholds, memory.traits, fitness);
      delete Memory.creeps[name];
    }
  }
}

function runRoom(room: Room): void {
  const energy = readEnergy(room);
  const snapshot = readRoom(room);
  const raw = computeStimuli(snapshot);

  // Every creep that calls this room home, WHEREVER IT CURRENTLY IS.
  //
  // This used to be `room.find(FIND_MY_CREEPS)`, which returns only creeps
  // standing in this room — so a creep that walked into a neighbouring room
  // stopped being processed at all. It received no orders, drifted onto an exit
  // tile, and the engine bounced it back and forth across the border. Every
  // "movement bug" in remote foraging was a symptom of this: the foragers were
  // not moving badly, they were not being run.
  const creeps = Object.values(Game.creeps).filter(
    c => (c.memory.home ?? c.room.name) === room.name,
  );

  // Occupancy is read from last tick's committed tasks, before anyone decides,
  // so every creep sees the same congestion picture and the damping cannot
  // depend on iteration order.
  const occupancy: TaskDistribution = { supply: 0, upgrade: 0, build: 0, remote: 0 };
  for (const creep of creeps) {
    const held = creep.memory.task;
    if (held) occupancy[held] += 1;
  }
  const stimuli = applyCongestion(raw, occupancy, snapshot);

  const distribution: TaskDistribution = { supply: 0, upgrade: 0, build: 0, remote: 0 };
  const switches: Record<string, number> = {};
  // Recruitment is a rate, not a step change: only so many creeps may join a
  // given task per tick, so a stimulus crossing every threshold at once can no
  // longer move the whole colony in a single tick.
  const joined: TaskDistribution = { supply: 0, upgrade: 0, build: 0, remote: 0 };
  let deferred = 0;

  for (const creep of creeps) {
    // One creep throwing must not cost every other creep its tick.
    try {
      // Caste creeps are dispatched by body, not by threshold: a [CLAIM, MOVE]
      // creep physically cannot do any of the normal tasks.
      if (isReserver(creep)) {
        runReserve(creep);
        continue;
      }

      const thresholds = ensureProfile(creep);
      const traits = ensureTraits(creep);
      const previous = creep.memory.task;

      // Commitment is deliberately narrow: finish delivering a load you are
      // already carrying, nothing more.
      //
      // A wider version — committing whenever the creep was away from home OR
      // carrying — locked foragers permanently, because a forager is in one of
      // those states almost its entire life. They could not re-evaluate even
      // when remote stimulus fell to zero, which bypassed congestion damping and
      // the recruitment limiter entirely: the whole colony became foragers,
      // nobody supplied the spawn, and the population collapsed to 2.
      //
      // Carrying-only still prevents the real waste (abandoning a haul
      // mid-journey) while leaving outbound creeps free to be re-tasked, which
      // is what the anti-thrash buffer and recruitment limiter already handle.
      // Commitment covers one leg — carrying a load home — and is stamped with
      // an expiry by the task itself, so a stuck creep frees itself rather than
      // locking the colony as an open-ended version once did.
      const commitUntil = creep.memory.commitUntil ?? 0;
      // Covers a whole round trip, not just the way home — but strictly
      // time-bounded, so a stuck forager releases itself instead of locking the
      // colony the way an open-ended version did. The stimulus cap and
      // congestion damping keep the number of simultaneously committed foragers
      // small enough that the rest of the colony carries on.
      const committed = REMOTE_ENABLED && previous === 'remote' && Game.time < commitUntil;
      if (commitUntil > 0 && Game.time >= commitUntil) {
        delete creep.memory.commitUntil;
      }

      if (committed) {
        distribution.remote += 1;
        RUNNERS.remote(creep, raw.remote);
        continue;
      }

      // Decisiveness and curiosity are the creep's own genes now, not globals.
      const decision = decide(stimuli, thresholds, previous, Math.random(), traits);

      if (decision.switched && joined[decision.task] >= RECRUIT_LIMIT_PER_TICK) {
        // Task is taking on all the recruits it can this tick; this creep keeps
        // doing what it was doing and may switch on a later tick.
        deferred += 1;
        distribution[previous ?? decision.task] += 1;
        if (previous) {
          RUNNERS[previous](creep, raw[previous]);
          continue;
        }
      }

      if (decision.switched) {
        // A new task starts with a clean slate — the old target is meaningless.
        creep.memory.taskState = {};
        joined[decision.task] += 1;
        switches[decision.reason] = (switches[decision.reason] ?? 0) + 1;
        // Per-switch detail is DEBUG-only: it is the single loudest event in the
        // system and is mostly exploration noise. The snapshot carries the
        // aggregate counts; turn DEBUG on only to inspect specific decisions.
        emit('DEBUG', 'task-switch', {
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

      RUNNERS[decision.task](creep, raw[decision.task]);
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

  // Trail pheromone: deposit where creeps actually are, evaporate on a timer,
  // and let roads crystallise where the trail persists. No route is planned —
  // the network is whatever the colony kept walking.
  depositTraffic(room, creeps);
  decayTraffic(room);
  const roads = proposeRoads(room);
  if (roads && roads.placed > 0) {
    emit('INFO', 'road-plan', { room: room.name, placed: roads.placed, hottest: Math.round(roads.hottest) });
  }

  // The colony sizes its own nest: population pressure proposes extensions,
  // and the build stimulus decides whether anyone actually works them.
  const nest = runNestExpansion(room, creeps.length, energy);
  if (nest && nest.placed) {
    emit('INFO', 'nest-expand', { room: room.name, have: nest.have, wanted: nest.wanted });
  }

  // The granary. Proposed before extensions matter, because a colony that
  // cannot store cannot bank a surplus and its growth tracks its worst tick.
  if (runStoragePlan(room)) {
    emit('INFO', 'storage-plan', { room: room.name, level: room.controller?.level ?? 0 });
  }

  const evo = evolutionStats();
  drawColonyHud(room, {
    distribution,
    stimuli,
    energy,
    deferred,
    generation: evo.generation,
    bestFitness: evo.best,
  });
  drawCreepLabels(room);

  if (Game.time % SNAPSHOT_INTERVAL === 0) {
    // Why the colony declined to reproduce over the last interval. Three
    // collapses have been misattributed; this replaces the next hypothesis
    // with evidence.
    emit('INFO', 'evolution-trajectory', { room: room.name, ...evolutionTrajectory() });

    // Death clustering, the quantity that actually decides whether the spawn can
    // keep up. The average replacement rate has always looked fine; it is the
    // busiest window that outruns one spawn and compounds into a collapse.
    const lives = creeps
      .filter(c => c.memory.caste !== 'reserver')
      .map(c => c.ticksToLive ?? 0);
    const windows: Record<number, number> = {};
    for (const ttl of lives) {
      const bucket = Math.floor(ttl / 100);
      windows[bucket] = (windows[bucket] ?? 0) + 1;
    }
    const peak = Math.max(0, ...Object.values(windows));
    emit('INFO', 'demography', {
      room: room.name,
      alive: lives.length,
      peakDeathsPer100: peak,
      spawnCapacityPer100: Math.round((100 / (2 * 6 * 3)) * 100) / 100,
    });

    const blocks = Memory.spawnBlocks ?? {};
    if (Object.keys(blocks).length > 0) {
      emit('INFO', 'spawn-blocks', { room: room.name, ...blocks });
      Memory.spawnBlocks = {};
    }

    emitSnapshot(
      room,
      { home: room.find(FIND_MY_CREEPS).length, total: creeps.length },
      stimuli,
      distribution,
      energy,
      switches,
      deferred,
      evolutionStats(),
    );
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
