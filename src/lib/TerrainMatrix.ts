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

export function findChokepoints(roomName: string): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const chokepoints: RoomPosition[] = [];

  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      if (!isWalkable(matrix, x, y)) continue;

      const neighbors = [
        isWalkable(matrix, x - 1, y),
        isWalkable(matrix, x + 1, y),
        isWalkable(matrix, x, y - 1),
        isWalkable(matrix, x, y + 1),
      ];

      const walkableCount = neighbors.filter(Boolean).length;

      if (walkableCount <= 2) {
        chokepoints.push(new RoomPosition(x, y, roomName));
      }
    }
  }

  return chokepoints;
}

export function findPerimeterPositions(roomName: string): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const perimeter: RoomPosition[] = [];

  for (let i = 0; i < 50; i++) {
    if (isWalkable(matrix, i, 1)) perimeter.push(new RoomPosition(i, 1, roomName));
    if (isWalkable(matrix, i, 48)) perimeter.push(new RoomPosition(i, 48, roomName));
    if (isWalkable(matrix, 1, i)) perimeter.push(new RoomPosition(1, i, roomName));
    if (isWalkable(matrix, 48, i)) perimeter.push(new RoomPosition(48, i, roomName));
  }

  return perimeter;
}

export function calculateCoverage(pos: RoomPosition, range: number, roomName: string): number {
  let count = 0;

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = pos.x + dx;
      const y = pos.y + dy;

      if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (distance <= range) {
          count++;
        }
      }
    }
  }

  return count;
}

export function findOptimalTowerPositions(roomName: string, count: number): RoomPosition[] {
  const matrix = getTerrainMatrix(roomName);
  const positions: RoomPosition[] = [];

  const candidates: { pos: RoomPosition; score: number }[] = [];

  for (let y = 5; y < 45; y++) {
    for (let x = 5; x < 45; x++) {
      if (!isWalkable(matrix, x, y)) continue;

      const pos = new RoomPosition(x, y, roomName);
      const coverage = calculateCoverage(pos, 10, roomName);

      const edgeDistance = Math.min(x, y, 49 - x, 49 - y);
      const score = coverage + edgeDistance * 2;

      candidates.push({ pos, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    positions.push(candidates[i].pos);
  }

  return positions;
}
