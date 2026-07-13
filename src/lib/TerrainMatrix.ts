import { getTerrainMatrix, isWalkable } from './PathFinder';

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
