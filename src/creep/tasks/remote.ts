import { REMOTE_COMMIT_TICKS, REMOTE_RETURN_FRACTION } from '../../config';
import { recordWork } from '../../evolution';

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
 * Cost matrix that makes every border tile impassable.
 *
 * Screeps pathfinding *ignores walls on room edges*, so a path is free to route
 * along the border or terminate on it. Combined with the transport rule below
 * that produces an endless blink between two rooms. Walling the border off at
 * 255 means a computed path can never end there in the first place — this is the
 * community's documented fix, not a guess.
 * See https://wiki.screepspl.us/index.php/Exit_tiles and
 * https://screeps.com/forum/topic/184/pathing-ignores-walls-on-room-edge
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
 * Never end a tick on an exit tile. Returns true if the creep spent its move
 * getting clear, in which case the caller must not issue another move.
 *
 * The engine transports a creep that *ends its tick* on an exit tile into the
 * adjacent room. A creep arriving in a new room lands on such a tile, so unless
 * it moves off during that very tick it is sent straight back — the blink.
 */
function stepOffEdge(creep: Creep): boolean {
  const { x, y } = creep.pos;
  if (x > 0 && x < 49 && y > 0 && y < 49) return false;
  // Toward the room centre is always inward from any edge.
  creep.moveTo(new RoomPosition(25, 25, creep.room.name), { reusePath: 0 });
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

  // Commit on FIRST tick of the trip, covering outbound as well as the return.
  // Committing only the homeward leg was not enough: a round trip takes longer
  // than a creep stays on the task, so outbound foragers were re-tasked before
  // reaching a source and never accumulated a load worth carrying — the reason
  // they sat around holding 27/150 with no phase ever set. The stamp is bounded
  // and expires by itself, which is what makes this safe where the earlier
  // open-ended version collapsed the colony.
  if (creep.memory.commitUntil === undefined) {
    creep.memory.commitUntil = Game.time + REMOTE_COMMIT_TICKS;
  }

  const carried = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const capacity = creep.store.getCapacity(RESOURCE_ENERGY);
  const phase = creep.memory.taskState?.phase ?? 'gathering';

  // Step off the border ONLY once inside the room we actually want to be in.
  //
  // An unconditional version of this guard was the reason nothing worked: to
  // *leave* a room a creep must step onto an exit tile, so shoving it back
  // inward every time it reached the border meant no forager ever crossed at
  // all. The blink the research describes happens on ARRIVAL — a creep
  // transported in lands on an exit tile and is sent back unless it moves off
  // that same tick — so the guard belongs there and nowhere else.
  const destination = phase === 'delivering' ? home : creep.memory.remoteRoom;
  if (creep.room.name === destination && stepOffEdge(creep)) {
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
    const sink = creep.pos.findClosestByPath(sinks, AVOID_BORDER);
    if (!sink) {
      // Home is full: the haul succeeded even though there is nowhere to put it.
      endTrip(creep);
      recordWork(creep, true, value);
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
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) >= capacity * REMOTE_RETURN_FRACTION) {
    beginReturn(creep);
  }
}
