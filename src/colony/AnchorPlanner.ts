import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';
import { findPath } from '../lib/PathFinder';

const BUNKER_RADIUS = 6;

export function findBestAnchor(room: Room): RoomPosition {
	const roomName = room.name;
	const matrix = getTerrainMatrix(roomName);

	const dist = new Array(50).fill(0).map(() => new Array(50).fill(0));
	const queue: { x: number; y: number }[] = [];

	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			if (!isWalkable(matrix, x, y) || x === 0 || y === 0 || x === 49 || y === 49) {
				dist[y][x] = 0;
				queue.push({ x, y });
			} else {
				dist[y][x] = Infinity;
			}
		}
	}

	let head = 0;
	while (head < queue.length) {
		const cur = queue[head++];
		const d = dist[cur.y][cur.x] + 1;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const nx = cur.x + dx;
				const ny = cur.y + dy;
				if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
				if (d < dist[ny][nx]) {
					dist[ny][nx] = d;
					queue.push({ x: nx, y: ny });
				}
			}
		}
	}

	const candidates: RoomPosition[] = [];
	const margin = BUNKER_RADIUS + 1;
	for (let y = margin; y < 50 - margin; y++) {
		for (let x = margin; x < 50 - margin; x++) {
			if (dist[y][x] >= BUNKER_RADIUS + 1) {
				candidates.push(new RoomPosition(x, y, roomName));
			}
		}
	}

	if (candidates.length === 0) {
		let best = 0;
		let bestPos = new RoomPosition(25, 25, roomName);
		for (let y = 0; y < 50; y++) {
			for (let x = 0; x < 50; x++) {
				if (dist[y][x] > best) {
					best = dist[y][x];
					bestPos = new RoomPosition(x, y, roomName);
				}
			}
		}
		return bestPos;
	}

	const sample = candidates.length > 20
		? candidates.sort(() => Math.random() - 0.5).slice(0, 20)
		: candidates;

	const goals: RoomPosition[] = [];
	if (room.controller) goals.push(room.controller.pos);
	for (const source of room.find(FIND_SOURCES)) {
		goals.push(source.pos);
	}

	let bestScore = Infinity;
	let bestAnchor = sample[0];

	for (const anchor of sample) {
		let score = 0;
		for (const goal of goals) {
			const ret = findPath(anchor, goal, { maxRooms: 1, maxOps: 5000, terrainCosts: { plainCost: 1, swampCost: 1 } });
			if (!ret.incomplete) {
				score += ret.path.length;
			} else {
				score += 1000;
			}
		}
		if (score < bestScore) {
			bestScore = score;
			bestAnchor = anchor;
		}
	}

	return bestAnchor;
}