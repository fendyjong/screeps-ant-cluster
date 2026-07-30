import { REMOTE_MIN_ENERGY_TO_RETURN } from '../../config';
import { recordWork } from '../../evolution';
import { updatePhase } from './gather';

/**
 * Remote foraging — harvesting sources outside the home room.
 *
 * A colony's income is capped by the resource density around its nest, not by
 * how many workers it fields (research doc §7.1.1). W5N8 holds 2 sources, so it
 * sustains 20 energy/tick and 10 useful WORK parts however large the colony
 * grows; it was carrying 74. Past carrying capacity the answer is not more
 * workers but more territory — polydomy, in the biology.
 *
 * This is deliberately a *task* rather than a dedicated role. It competes for
 * labor through the same threshold mechanism as everything else, so the colony
 * decides how many foragers to send the same way it decides everything else —
 * no central allocation.
 *
 * The creep is dumb about geography on purpose: it walks to a chosen adjacent
 * room, harvests, and walks home when full. Which room it chose is remembered
 * per creep so it does not oscillate at the border.
 */

/** Records what a creep can see, so target choice improves as rooms are visited. */
function noteRoom(room: Room): void {
  const intel = Memory.remotes ?? (Memory.remotes = {});
  intel[room.name] = {
    sources: room.find(FIND_SOURCES).length,
    hostile: room.find(FIND_HOSTILE_CREEPS).length > 0,
    lastSeen: Game.time,
  };
}

/**
 * Picks a room to forage. Prefers the best room actually seen; falls back to an
 * unvisited neighbour so the colony explores rather than starving on ignorance.
 */
function chooseRemote(home: string): string | undefined {
  const exits = Object.values(Game.map.describeExits(home) ?? {}) as string[];
  if (exits.length === 0) return undefined;

  const intel = Memory.remotes ?? {};
  const unvisited = exits.filter(r => !intel[r]);
  if (unvisited.length > 0) {
    return unvisited[Math.floor(Math.random() * unvisited.length)];
  }

  const known = exits
    .filter(r => intel[r] && intel[r].sources > 0 && !intel[r].hostile)
    .sort((a, b) => intel[b].sources - intel[a].sources);

  return known[0];
}

export function run(creep: Creep, value: number): void {
  const home = creep.memory.home ?? (creep.memory.home = creep.room.name);
  const phase = updatePhase(creep);

  // Always record what we can see, whichever phase we are in.
  noteRoom(creep.room);

  if (phase === 'delivering') {
    if (creep.room.name !== home) {
      // No `range` option: stopping short leaves the creep parked on an exit
      // tile, and the engine teleports creeps off exit tiles into the adjacent
      // room — so a creep that "arrives" on the border bounces across it
      // forever. Path to the room centre and keep walking until actually there.
      creep.moveTo(new RoomPosition(25, 25, home));
      recordWork(creep, true, value); // hauling home is the productive half
      return;
    }
    const sink = creep.pos.findClosestByPath(
      creep.room.find(FIND_STRUCTURES).filter(
        (s): s is StructureSpawn | StructureExtension =>
          (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
          (s as StructureSpawn).my === true &&
          (s as StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0,
      ),
    );
    if (!sink) {
      // Home is full; the energy is still banked, so this is not wasted effort.
      recordWork(creep, false, value);
      return;
    }
    const result = creep.transfer(sink, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(sink);
    recordWork(creep, result === OK || result === ERR_NOT_IN_RANGE, value);
    return;
  }

  // Gathering: get to the target room, then harvest there.
  const target = creep.memory.remoteRoom ?? (creep.memory.remoteRoom = chooseRemote(home));
  if (!target) {
    recordWork(creep, false, value);
    return;
  }

  if (creep.room.name !== target) {
    creep.moveTo(new RoomPosition(25, 25, target));
    recordWork(creep, false, value); // travel is overhead, not production
    return;
  }

  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
  if (!source) {
    // Nothing worth taking here — forget it and pick again next tick, so a
    // depleted or barren room does not trap the creep forever.
    delete creep.memory.remoteRoom;
    recordWork(creep, false, value);
    return;
  }

  const result = creep.harvest(source);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
  recordWork(creep, result === OK, value);

  // Head home once carrying enough to be worth the trip.
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) >= REMOTE_MIN_ENERGY_TO_RETURN) {
    const state = creep.memory.taskState ?? {};
    state.phase = 'delivering';
    creep.memory.taskState = state;
  }
}
