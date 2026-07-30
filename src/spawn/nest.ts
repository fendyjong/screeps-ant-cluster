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
