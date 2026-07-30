import {
  CREEPS_PER_EXTENSION,
  NEST_PLAN_INTERVAL,
  NEST_SATIATED_RATIO,
  NEST_SEARCH_RADIUS,
} from '../config';

/**
 * Nest expansion — the colony sizing its own housing.
 *
 * Biology (research doc §7.4): population size controls nest area, not the
 * reverse. Colonies do not build capacity ahead of need and grow into it; new
 * workers raise local density, and density drives excavation. So the number of
 * extensions the colony wants is a function of how many workers it already has,
 * not a fixed blueprint.
 *
 * This is the one place the colony acts on its environment rather than reacting
 * to it, and it stays deliberately dumb: propose at most one site per planning
 * pass, let the existing `build` task decide whether anyone works it. Whether a
 * site actually gets built is still an emergent outcome of the build stimulus
 * competing against supply and upgrade — nothing here forces labor to it.
 */

/** Extensions the colony wants at its current population, capped by RCL. */
export function desiredExtensions(
  room: Room,
  creepCount: number,
  energy: { available: number; capacity: number },
): number {
  const level = room.controller?.level ?? 0;
  const allowed = CONTROLLER_STRUCTURES.extension[level] ?? 0;

  const fromPopulation = Math.ceil(creepCount / CREEPS_PER_EXTENSION);

  // Satiated reserves mean the colony can fill what it has and should build
  // more. This self-limits: every extension added makes satiation harder to
  // reach, so growth decelerates as the nest fills out.
  const satiated =
    energy.capacity > 0 && energy.available / energy.capacity >= NEST_SATIATED_RATIO;
  const wanted = satiated ? Math.max(fromPopulation, allowed) : fromPopulation;

  return Math.min(allowed, wanted);
}

/**
 * First free tile on an expanding ring around the spawn.
 *
 * Restricted to a checkerboard (`(x + y) % 2 === 0`) so the other half of the
 * tiles stay permanently walkable — extensions packed solid would wall the spawn
 * in and strand every creep trying to deliver to it.
 */
function findExtensionSpot(room: Room, origin: RoomPosition): RoomPosition | null {
  const terrain = room.getTerrain();

  for (let radius = 2; radius <= NEST_SEARCH_RADIUS; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Ring only — inner tiles were covered by a previous radius.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

        const x = origin.x + dx;
        const y = origin.y + dy;
        // Room edges are exits; structures there are illegal.
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        if ((x + y) % 2 !== 0) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;

        return new RoomPosition(x, y, room.name);
      }
    }
  }
  return null;
}

/**
 * Proposes the colony's granary.
 *
 * A colony with no store lives tick to tick. Measured here: spawn plus 30
 * extensions hold 1800 energy, while the fleet was carrying 3294 — nearly twice
 * the room's whole capacity — because foragers came home to a full nest and had
 * nowhere to unload. Only 4.9% of available income reached the controller; the
 * rest rode around inside creeps until they died. Storage holds 1,000,000 and
 * does not decay, so it converts "income the colony cannot absorb" into
 * "income the colony banks".
 *
 * The biology is the reason this is a structure rather than a policy. Honeypot
 * ants (Myrmecocystus) solve exactly this problem: foragers return during a
 * glut, and the colony has no way to use the food now, so repletes hang from the
 * ceiling as living vessels and are tapped during dearth. Seed harvesters
 * (Pogonomyrmex) do the same with granary chambers. A colony that cannot store
 * cannot buffer a boom against a bust, and its growth is limited by its worst
 * moment rather than its average one.
 *
 * Placed adjacent to the spawn, where both the supply chain and the returning
 * foragers already converge.
 */
export function runStoragePlan(room: Room): boolean {
  if (Game.time % NEST_PLAN_INTERVAL !== 0) return false;

  const level = room.controller?.level ?? 0;
  if ((CONTROLLER_STRUCTURES.storage[level] ?? 0) < 1) return false;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return false;

  const built = room
    .find(FIND_STRUCTURES)
    .some(s => s.structureType === STRUCTURE_STORAGE);
  const pending = room
    .find(FIND_CONSTRUCTION_SITES)
    .some(s => s.structureType === STRUCTURE_STORAGE);
  if (built || pending) return false;

  const spot = findExtensionSpot(room, spawn.pos);
  if (!spot) return false;

  return room.createConstructionSite(spot, STRUCTURE_STORAGE) === OK;
}

/** First free buildable tile in a ring around a target. */
function freeTileNear(room: Room, origin: RoomPosition, maxRange: number): RoomPosition | null {
  const terrain = room.getTerrain();
  for (let radius = 1; radius <= maxRange; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        return new RoomPosition(x, y, room.name);
      }
    }
  }
  return null;
}

/**
 * Proposes a link pair: one beside a source, one beside the controller.
 *
 * This is the fix for the quantity now known to bind. Per-creep delivery rises
 * monotonically as the colony shrinks (0.094 at 28.5 creeps to 0.205 at 19),
 * which says creeps spend their lives travelling rather than working — the
 * central-place limit of §7.1.1. A link moves energy *without a creep carrying
 * it*: `LINK_CAPACITY` 800 per transfer at a flat 3% loss, verified on disk, over
 * any distance in the room. An upgrader standing at the controller link never
 * walks anywhere again.
 *
 * That is a genuinely different mechanism from anything the colony has, and it is
 * the one piece of infrastructure that raises output without adding creeps —
 * which matters because adding creeps has been measured to *lower* per-creep
 * delivery.
 *
 * Placement is central by necessity, exactly as §9.5 argues: no local signal can
 * encode "a link belongs beside the controller". Traffic cannot discover it,
 * because the whole point is to eliminate the traffic that would reveal it.
 *
 * Controller first, then source, because a lone controller link still receives
 * from creeps while a lone source link has nowhere to send.
 */
export function runLinkPlan(room: Room): boolean {
  if (Game.time % NEST_PLAN_INTERVAL !== 0) return false;

  const level = room.controller?.level ?? 0;
  if ((CONTROLLER_STRUCTURES.link[level] ?? 0) < 2) return false;

  // Pending sites count. The first version checked only built structures, so on
  // the planning pass after placing the controller link that link was still a
  // construction site, "no link near the controller" was still true, and it
  // placed a second one right beside the first. Both ended up at the controller
  // with neither near a source, which is a link pair that can move nothing.
  const placed = [
    ...room
      .find(FIND_STRUCTURES)
      .filter(s => s.structureType === STRUCTURE_LINK)
      .map(s => s.pos),
    ...room
      .find(FIND_CONSTRUCTION_SITES)
      .filter(s => s.structureType === STRUCTURE_LINK)
      .map(s => s.pos),
  ];

  const controller = room.controller;
  if (!controller) return false;
  const sources = room.find(FIND_SOURCES);

  // Wanted by ROLE, not by count — two links are useless if both sit at the same
  // end. The pair only transports anything if one is beside a source and one
  // beside the controller.
  const haveController = placed.some(p => p.getRangeTo(controller) <= 3);
  const haveSource = sources.some(src => placed.some(p => p.getRangeTo(src) <= 3));
  if (haveController && haveSource) return false;
  if (placed.length >= (CONTROLLER_STRUCTURES.link[level] ?? 0)) return false;

  const target = haveController ? sources[0]?.pos : controller.pos;
  if (!target) return false;

  const spot = freeTileNear(room, target, 3);
  if (!spot) return false;

  return room.createConstructionSite(spot, STRUCTURE_LINK) === OK;
}

/**
 * Runs the link pair: everything not beside the controller pushes to the one
 * that is. Cooldown and partial loads are handled by the engine, so a failed
 * transfer is free and simply retried next tick.
 */
export function runLinks(room: Room): void {
  const controller = room.controller;
  if (!controller) return;

  const links = room
    .find(FIND_STRUCTURES)
    .filter((s): s is StructureLink => s.structureType === STRUCTURE_LINK && s.my);
  if (links.length < 2) return;

  const sink = links.find(l => l.pos.getRangeTo(controller) <= 3);
  if (!sink) return;

  for (const link of links) {
    if (link.id === sink.id) continue;
    // A second link parked at the controller is a mistake this code already made
    // once; shipping energy between two controller-adjacent links moves nothing
    // and burns the 3% loss for it.
    if (link.pos.getRangeTo(controller) <= 3) continue;
    if (link.cooldown > 0) continue;
    if (link.store.getUsedCapacity(RESOURCE_ENERGY) === 0) continue;
    if (sink.store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
    link.transferEnergy(sink);
  }
}

/**
 * Proposes towers, the colony's only possible defence.
 *
 * This was deprioritised on a wrong conclusion, and the correction is worth
 * recording where the code lives. Deaths were declared "confirmed non-hostile"
 * from a single snapshot that found no enemies — taken, it turns out, between
 * invader waves. Instrumenting time-of-death showed the truth: creeps dying with
 * a median of 573 ticks left, some after only 27, 31 and 56 ticks of a 1500-tick
 * life, and `hostile-room` firing 25 times for **W5N8 itself**. Invader cores in
 * W4N7 and W5N7 spawn waves that walk into the home room, and a colony with no
 * towers has literally nothing to answer with.
 *
 * A tower deals `TOWER_POWER_ATTACK` 600 at `TOWER_OPTIMAL_RANGE` 5, falling to
 * 150 by range 20 — all verified on disk — for 10 energy a shot. Nothing else the
 * colony can build fights at all.
 *
 * Placed beside the spawn: that is what the invaders come for, it is where the
 * energy to refill is, and `TOWER_FALLOFF_RANGE` 20 covers most of a 50-tile room
 * from near the middle of the nest.
 */
export function runTowerPlan(room: Room): boolean {
  if (Game.time % NEST_PLAN_INTERVAL !== 0) return false;

  const level = room.controller?.level ?? 0;
  const allowed = CONTROLLER_STRUCTURES.tower[level] ?? 0;
  if (allowed < 1) return false;

  const placed =
    room.find(FIND_STRUCTURES).filter(s => s.structureType === STRUCTURE_TOWER).length +
    room.find(FIND_CONSTRUCTION_SITES).filter(s => s.structureType === STRUCTURE_TOWER).length;
  if (placed >= allowed) return false;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return false;

  const spot = freeTileNear(room, spawn.pos, 5);
  if (!spot) return false;

  return room.createConstructionSite(spot, STRUCTURE_TOWER) === OK;
}

/**
 * Fires every loaded tower at the closest hostile.
 *
 * Closest rather than weakest: damage falls off with range, so the nearest target
 * is both the one taking the most damage per shot and the one about to reach the
 * spawn. Healing and repair are deliberately left out — this exists because
 * creeps are being killed, and splitting the energy between jobs while under
 * attack helps neither.
 */
export function runTowers(room: Room): number {
  const towers = room
    .find(FIND_STRUCTURES)
    .filter(
      (s): s is StructureTower =>
        s.structureType === STRUCTURE_TOWER &&
        s.my &&
        s.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST,
    );
  if (towers.length === 0) return 0;

  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  if (hostiles.length === 0) return 0;

  let fired = 0;
  for (const tower of towers) {
    const target = tower.pos.findClosestByRange(hostiles);
    if (target && tower.attack(target) === OK) fired += 1;
  }
  return fired;
}

export interface NestPlan {
  placed: boolean;
  have: number;
  wanted: number;
}

/**
 * Proposes at most one extension site, and only when population has outgrown the
 * nest. Returns null on ticks where planning does not run, so callers can tell
 * "not evaluated" from "evaluated, nothing to do".
 */
export function runNestExpansion(
  room: Room,
  creepCount: number,
  energy: { available: number; capacity: number },
): NestPlan | null {
  if (Game.time % NEST_PLAN_INTERVAL !== 0) return null;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return null;

  const structures = room.find(FIND_STRUCTURES);
  const built = structures.filter(
    s => s.structureType === STRUCTURE_EXTENSION && (s as StructureExtension).my === true,
  ).length;
  const pending = room
    .find(FIND_CONSTRUCTION_SITES)
    .filter(s => s.structureType === STRUCTURE_EXTENSION).length;

  const have = built + pending;
  const wanted = desiredExtensions(room, creepCount, energy);
  if (have >= wanted) return { placed: false, have, wanted };

  const spot = findExtensionSpot(room, spawn.pos);
  if (!spot) return { placed: false, have, wanted };

  const result = room.createConstructionSite(spot, STRUCTURE_EXTENSION);
  return { placed: result === OK, have, wanted };
}
