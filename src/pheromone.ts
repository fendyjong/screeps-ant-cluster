import {
  ROAD_MAX_PENDING_SITES,
  ROAD_PLAN_INTERVAL,
  ROAD_TRAFFIC_THRESHOLD,
  TRAFFIC_DECAY,
  TRAFFIC_DECAY_INTERVAL,
  TRAFFIC_PRUNE_BELOW,
} from './config';

/**
 * Trail pheromone, and roads as its permanent form.
 *
 * Every creep deposits on the tile it occupies; the map evaporates on a timer.
 * Tiles that stay hot are ones the colony genuinely keeps walking, so a road
 * there is worth its cost — the research doc calls this "frozen pheromone"
 * (§11.3).
 *
 * The biology is literal rather than metaphorical. Atta leafcutters do not just
 * lay chemical trails; they physically clear trunk trails through undergrowth,
 * workers move measurably faster on cleared paths, and the clearing pays for
 * itself within days. Critically it is "infrastructure construction without
 * information exchange" — no ant plans the network. Each clears obstacles on
 * paths it happens to use, and the network is what remains. Nothing here plans
 * a road network either: traffic accumulates, roads crystallise where it
 * persists, and the build stimulus decides whether anyone lays them.
 *
 * Memory cost is the reason this map is sparse and pruned. Memory is serialized
 * every tick, so a dense 50x50 grid per room would be 2500 entries of pure
 * overhead; only walked tiles are stored, and evaporation deletes the cold ones.
 */

type TrafficMap = Record<string, number>;

function mapFor(roomName: string): TrafficMap {
  const all = Memory.traffic ?? (Memory.traffic = {});
  return all[roomName] ?? (all[roomName] = {});
}

/** One deposit per creep per tick, on the tile it currently occupies. */
export function depositTraffic(room: Room, creeps: Creep[]): void {
  const map = mapFor(room.name);
  for (const creep of creeps) {
    const key = `${creep.pos.x},${creep.pos.y}`;
    map[key] = (map[key] ?? 0) + 1;
  }
}

/**
 * Evaporation. Without it, every tile ever walked eventually crosses the road
 * threshold and the colony paves the whole room; decay is what makes a road
 * mean "currently useful" instead of "used once".
 */
export function decayTraffic(room: Room): void {
  if (Game.time % TRAFFIC_DECAY_INTERVAL !== 0) return;
  const map = mapFor(room.name);
  for (const key of Object.keys(map)) {
    const next = map[key] * TRAFFIC_DECAY;
    if (next < TRAFFIC_PRUNE_BELOW) {
      delete map[key];
    } else {
      map[key] = next;
    }
  }
}

export interface RoadPlan {
  placed: number;
  hottest: number;
}

/**
 * Proposes road sites on the hottest tiles. Places at most a couple at a time so
 * builders are not swamped, and skips planning entirely while sites are already
 * outstanding — the colony should finish what it started before opening more.
 */
export function proposeRoads(room: Room): RoadPlan | null {
  if (Game.time % ROAD_PLAN_INTERVAL !== 0) return null;

  const pending = room.find(FIND_CONSTRUCTION_SITES).length;
  if (pending >= ROAD_MAX_PENDING_SITES) return null;

  const map = mapFor(room.name);
  const hot = Object.entries(map)
    .filter(([, weight]) => weight >= ROAD_TRAFFIC_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  if (hot.length === 0) return { placed: 0, hottest: 0 };

  let placed = 0;
  for (const [key, weight] of hot) {
    if (pending + placed >= ROAD_MAX_PENDING_SITES) break;

    const [x, y] = key.split(',').map(Number);
    if (x < 1 || x > 48 || y < 1 || y > 48) continue;

    // A road under a structure is wasted; a road where one is already planned
    // is a duplicate. Both are cheap to check and expensive to get wrong.
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    if (structures.some(s => s.structureType === STRUCTURE_ROAD)) continue;
    if (structures.length > 0) continue;
    if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;

    if (room.createConstructionSite(x, y, STRUCTURE_ROAD) === OK) placed += 1;
  }

  return { placed, hottest: hot[0][1] };
}
