import { NEST_SPAWN_RESERVE, REMOTE_COMMIT_TICKS } from '../../config';
import { readEnergy } from '../stimuli';
import { ensureTraits, recordWork } from '../../evolution';

/**
 * Remote foraging — harvesting sources outside the home room.
 *
 * A colony cannot outgrow its central place (research doc §7.1.1). W5N8 holds 2
 * sources, so it sustains 20 energy/tick and 10 useful WORK parts however large
 * the colony grows; it was fielding 74. Past carrying capacity the answer is
 * territory, not more workers.
 *
 * This is a rewrite. The first attempt failed three ways, and each is designed
 * against here explicitly:
 *
 *  1. **Creeps parked on exit tiles and bounced.** The engine transfers a creep
 *     standing on an exit tile into the adjacent room, so any logic that lets a
 *     creep *rest* on x/y of 0 or 49 produces an infinite border oscillation.
 *     `stepOffEdge` now runs before anything else and is unconditional.
 *  2. **Foragers stranded at partial loads.** The shared `updatePhase` only
 *     sends a creep home when its store is completely full — fine for in-room
 *     tasks where topping up is cheap, fatal for a round trip. This task owns
 *     its phase logic and returns at a *fraction* of capacity, or as soon as the
 *     room has nothing left worth taking.
 *  3. **Commitment locked the colony.** Committing a creep that was "away or
 *     carrying" covered nearly its whole life, so foragers could never
 *     re-evaluate; the colony went all-remote and starved. Commitment now lives
 *     here as an explicit expiry stamp covering one leg — the trip home — and
 *     lapses on its own even if something goes wrong.
 */

/**
 * Ported from the archived Overmind fork (`archive/overmind-fork`), whose
 * `Movement`/`Pathing` classes solve this properly. Reading working code beat
 * six rounds of guessing against a live colony.
 *
 * Three separate pieces, and getting any one wrong reproduces the bouncing:
 *  1. `blockExits` on the cost matrix for *in-room* pathing, because Screeps
 *     pathfinding ignores walls on room borders and will otherwise route along
 *     and terminate on them (Overmind: `MatrixLib.blockExits`).
 *  2. `moveOffExit` — a single step to the best adjacent non-edge walkable tile,
 *     NOT a path to the room centre. One guaranteed step off the border.
 *  3. It fires ONLY on arrival at the destination. Overmind calls it inside the
 *     `rangeToDestination <= opts.range` branch of `goTo`. Applying it whenever a
 *     creep neared a border — which I did — prevents leaving a room at all,
 *     since exiting requires stepping onto an exit tile.
 */

/** Overmind: `RoomPosition.isEdge`. */
function isEdge(pos: RoomPosition): boolean {
  return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49;
}

/**
 * Cost matrix that makes every border tile impassable. Overmind's
 * `MatrixLib.blockExits`, used whenever pathing is meant to stay in-room.
 */
function borderAvoidingMatrix(roomName: string): CostMatrix {
  const matrix = new PathFinder.CostMatrix();
  for (let i = 0; i < 50; i++) {
    matrix.set(0, i, 255);
    matrix.set(49, i, 255);
    matrix.set(i, 0, 255);
    matrix.set(i, 49, 255);
  }
  return matrix;
}

/** Movement options that keep a creep away from borders while inside a room. */
const AVOID_BORDER = {
  costCallback: (roomName: string) => borderAvoidingMatrix(roomName),
};

/**
 * One step off an exit tile onto the best adjacent non-edge walkable tile.
 * Port of Overmind's `Movement.moveOffExit`.
 *
 * A single `move` rather than a `moveTo`: the creep must clear the border on
 * *this* tick, because the engine transports anything still standing on an exit
 * tile back into the adjacent room. Pathing to the room centre — what I did
 * before — can be blocked, can fail, and does not guarantee the step happens now.
 *
 * Returns true if it used the creep's move for this tick.
 */
function moveOffExit(creep: Creep, toward?: RoomPosition): boolean {
  if (!isEdge(creep.pos)) return false;

  const terrain = creep.room.getTerrain();
  let best: RoomPosition | undefined;
  let bestPenalty = Infinity;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = creep.pos.x + dx;
      const y = creep.pos.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48) continue; // never onto another edge
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

      const pos = new RoomPosition(x, y, creep.room.name);
      // Ramparts are walkable when they are ours, so test blocking directly
      // rather than by structure type.
      const blocked = pos
        .lookFor(LOOK_STRUCTURES)
        .some(st =>
          st.structureType === STRUCTURE_WALL ||
          (st.structureType === STRUCTURE_RAMPART && !(st as StructureRampart).my) ||
          (st.structureType !== STRUCTURE_RAMPART &&
            st.structureType !== STRUCTURE_ROAD &&
            st.structureType !== STRUCTURE_CONTAINER),
        );
      if (blocked) continue;

      // Overmind's weighting: prefer non-swamp, and step toward the goal.
      let penalty = terrain.get(x, y) === TERRAIN_MASK_SWAMP ? 10 : 0;
      if (toward) penalty += pos.getRangeTo(toward);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = pos;
      }
    }
  }

  if (!best) return false;
  creep.move(creep.pos.getDirectionTo(best));
  return true;
}

function noteRoom(room: Room): void {
  const intel = Memory.remotes ?? (Memory.remotes = {});
  intel[room.name] = {
    sources: room.find(FIND_SOURCES).length,
    hostile: room.find(FIND_HOSTILE_CREEPS).length > 0,
    lastSeen: Game.time,
  };
}

function chooseRemote(home: string): string | undefined {
  const exits = Object.values(Game.map.describeExits(home) ?? {}) as string[];
  if (exits.length === 0) return undefined;

  const intel = Memory.remotes ?? {};
  const unvisited = exits.filter(r => !intel[r]);
  if (unvisited.length > 0) return unvisited[Math.floor(Math.random() * unvisited.length)];

  const known = exits
    .filter(r => intel[r] && intel[r].sources > 0 && !intel[r].hostile)
    .sort((a, b) => intel[b].sources - intel[a].sources);
  return known[0];
}

/** Marks the creep as heading home, committed for one leg only. */
function beginReturn(creep: Creep): void {
  const state = creep.memory.taskState ?? {};
  state.phase = 'delivering';
  creep.memory.taskState = state;
  creep.memory.commitUntil = Game.time + REMOTE_COMMIT_TICKS;
}

function endTrip(creep: Creep): void {
  const state = creep.memory.taskState ?? {};
  state.phase = 'gathering';
  creep.memory.taskState = state;
  delete creep.memory.commitUntil;
}

export function run(creep: Creep, value: number): void {
  const home = creep.memory.home ?? (creep.memory.home = creep.room.name);
  noteRoom(creep.room);

  // Commitment is set only when heading home with a load (see `beginReturn`),
  // never on the outbound leg.
  //
  // Outbound commitment existed to stop foragers being re-tasked before they
  // reached a source — but the real cause of that was the main loop skipping
  // creeps outside the home room, so they received no orders at all. With that
  // fixed, outbound foragers path normally and congestion damping can do its
  // job. Committing outbound as well simply overrode the damping and let remote
  // monopolise the colony: 14 of 17 creeps foraging with `upgrade` at zero.

  const carried = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const capacity = creep.store.getCapacity(RESOURCE_ENERGY);
  const phase = creep.memory.taskState?.phase ?? 'gathering';

  // Arrival-only, exactly as Overmind scopes it: the guard belongs in the
  // "reached my destination" branch and nowhere else, because leaving a room
  // requires stepping onto an exit tile.
  const destination = phase === 'delivering' ? home : creep.memory.remoteRoom;
  if (creep.room.name === destination && moveOffExit(creep)) {
    recordWork(creep, phase === 'delivering', value);
    return;
  }

  if (phase === 'delivering') {
    if (carried === 0) {
      // Nothing left to deliver — trip over, free to be re-tasked.
      endTrip(creep);
      recordWork(creep, false, value);
      return;
    }

    if (creep.room.name !== home) {
      creep.moveTo(new RoomPosition(25, 25, home));
      recordWork(creep, true, value); // hauling home is productive work
      return;
    }

    const sinks = creep.room.find(FIND_STRUCTURES).filter(
      (s): s is StructureSpawn | StructureExtension =>
        (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
        (s as StructureSpawn).my === true &&
        (s as StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    );
    // Foreign income banks; local income feeds the nest.
    //
    // Overflow-only was measured and failed: storage sat at 0 for 5319 ticks
    // because spawn and extensions are a leaky bucket — spawning drains them at
    // ~4.4 energy/tick, so they always had room and nothing ever spilled over.
    // A granary needs a dedicated inflow, not a spillway.
    //
    // Splitting it by origin gives it one without any new bookkeeping: local
    // suppliers keep the nest topped up for spawning, and remote foragers —
    // whose loads are surplus by definition, since the nest was already being
    // fed while they were away — deposit to the granary, which upgraders then
    // draw on instantly instead of mining at 2 energy/tick.
    // Route by need, not by a fixed preference. Both fixed orderings failed:
    //
    //  - Nest first, granary as fallback: the granary sat at 0 for 5319 ticks,
    //    because spawning drains the nest at ~4.4 energy/tick so it always had
    //    room and nothing ever spilled over. A leaky bucket never overflows.
    //  - Granary first, nest as fallback: worse. Storage free capacity is
    //    1,000,000, so that branch is always taken — foragers stopped feeding
    //    the nest entirely, spawn fell to 36 of 300, and the population
    //    collapsed from 26 to 2.
    //
    // The lesson is the same in both directions: a two-way choice written as a
    // fixed precedence resolves the same way every tick regardless of what the
    // colony actually needs. Brood provisioning comes first in a real colony and
    // storage takes the surplus, but "first" there means priority under
    // competition, not a fixed queue — repletes are filled during a glut, not
    // after the last larva is fed.
    const nest = readEnergy(creep.room);
    const nestHungry = nest.available < Math.min(NEST_SPAWN_RESERVE, nest.capacity);

    const granary = creep.room
      .find(FIND_STRUCTURES)
      .find(
        (s): s is StructureStorage =>
          s.structureType === STRUCTURE_STORAGE &&
          (s as StructureStorage).my === true &&
          (s as StructureStorage).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      );

    const nestSink = creep.pos.findClosestByPath(sinks, AVOID_BORDER);
    const sink = nestHungry ? (nestSink ?? granary) : (granary ?? nestSink);

    if (!sink) {
      // Genuinely nowhere to put it — nest full and no granary yet. Not a
      // success: the trip delivered nothing.
      endTrip(creep);
      recordWork(creep, false, value);
      return;
    }

    const result = creep.transfer(sink, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(sink, AVOID_BORDER);
    if (result === OK) endTrip(creep);
    recordWork(creep, result === OK || result === ERR_NOT_IN_RANGE, value);
    return;
  }

  // --- gathering ---
  const target = creep.memory.remoteRoom ?? (creep.memory.remoteRoom = chooseRemote(home));
  if (!target) {
    recordWork(creep, false, value);
    return;
  }

  if (creep.room.name !== target) {
    creep.moveTo(new RoomPosition(25, 25, target));
    recordWork(creep, false, value); // travel is overhead
    return;
  }

  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, AVOID_BORDER);
  if (!source) {
    // Nothing worth taking. Carry what we have home rather than loitering; if
    // empty-handed, forget this room so a barren one cannot trap the creep.
    if (carried > 0) {
      beginReturn(creep);
    } else {
      delete creep.memory.remoteRoom;
    }
    recordWork(creep, false, value);
    return;
  }

  const result = creep.harvest(source);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(source, AVOID_BORDER);
  recordWork(creep, result === OK, value);

  // Re-read the store: `carried` was sampled before this tick's harvest, so
  // using it here lags the decision by a tick and can miss the threshold.
  // How full to fill before hauling home is this creep's own heritable trait.
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) >= capacity * ensureTraits(creep).returnFraction) {
    beginReturn(creep);
  }
}
