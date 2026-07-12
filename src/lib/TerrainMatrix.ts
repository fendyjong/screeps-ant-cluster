import { CostMatrix } from 'screeps';

const TERRAIN_COSTS = {
  plain: 1,
  swamp: 5,
  wall: 255,
};

function ensurePathingMemory(): void {
  if (!Memory.pathing) {
    Memory.pathing = {};
  }
  if (!Memory.pathing.terrain) {
    Memory.pathing.terrain = {};
  }
}

function generateTerrainMatrix(roomName: string): CostMatrix {
  const matrix = new PathFinder.CostMatrix();
  const terrain = Game.map.getRoomTerrain(roomName);

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const terrainType = terrain.get(x, y);

      if (terrainType === TERRAIN_MASK_WALL) {
        matrix.set(x, y, TERRAIN_COSTS.wall);
      } else if (terrainType === TERRAIN_MASK_SWAMP) {
        matrix.set(x, y, TERRAIN_COSTS.swamp);
      } else {
        matrix.set(x, y, TERRAIN_COSTS.plain);
      }
    }
  }

  return matrix;
}

export function getTerrainMatrix(roomName: string): CostMatrix {
  ensurePathingMemory();

  const cached = Memory.pathing.terrain[roomName];
  if (cached) {
    return PathFinder.CostMatrix.deserialize(cached.matrix);
  }

  const matrix = generateTerrainMatrix(roomName);
  Memory.pathing.terrain[roomName] = {
    matrix: matrix.serialize(),
    tick: Game.time,
  };

  return matrix;
}

export function isWalkable(terrainMatrix: CostMatrix, x: number, y: number): boolean {
  if (x < 0 || x > 49 || y < 0 || y > 49) return false;
  return terrainMatrix.get(x, y) < 255;
}

export function findWalkablePositions(roomName: string): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const positions: RoomPosition[] = [];

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (isWalkable(matrix, x, y)) {
        positions.push(new RoomPosition(x, y, roomName));
      }
    }
  }

  return positions;
}
