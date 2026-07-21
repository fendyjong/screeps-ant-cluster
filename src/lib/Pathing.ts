import { findPath, MoveOpts } from './PathFinder';
import { getTerrainCosts, normalizePos } from './helpers';
import { PathingMemory, HasPos } from '../types';

const MOVE_PRIORITY: Record<string, number> = {
	harvester: 1,
	defender: 2,
	hauler: 3,
	builder: 4,
	upgrader: 5,
	scout: 9,
};

const DEFAULT_PRIORITY = 10;
const STUCK_THRESHOLD = 2;
const TRAFFIC_THRESHOLD = 50;

const DIR_OFFSETS: Record<number, { dx: number; dy: number }> = {
	1: { dx: 0, dy: -1 },
	2: { dx: 1, dy: -1 },
	3: { dx: 1, dy: 0 },
	4: { dx: 1, dy: 1 },
	5: { dx: 0, dy: 1 },
	6: { dx: -1, dy: 1 },
	7: { dx: -1, dy: 0 },
	8: { dx: -1, dy: -1 },
};

function oppositeDir(dir: DirectionConstant): DirectionConstant {
	return ((dir + 3) % 8 + 1) as DirectionConstant;
}

function getPushPriority(creep: Creep): number {
	return MOVE_PRIORITY[creep.memory.role] ?? DEFAULT_PRIORITY;
}

function serializePath(startPos: RoomPosition, path: RoomPosition[]): string {
	let result = '';
	let last = startPos;
	for (const pos of path) {
		if (pos.roomName === last.roomName) {
			result += last.getDirectionTo(pos);
		}
		last = pos;
	}
	return result;
}

function isStuck(creep: Creep): boolean {
	const last = creep.memory._lastPos as { x: number; y: number; roomName: string } | undefined;
	if (!last) {
		creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
		return false;
	}
	if (creep.pos.x === last.x && creep.pos.y === last.y && creep.room.name === last.roomName) {
		creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
	} else {
		creep.memory._stuckTicks = 0;
	}
	creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
	return (creep.memory._stuckTicks || 0) > STUCK_THRESHOLD;
}

function tryPush(creep: Creep, dir: DirectionConstant): boolean {
	const offset = DIR_OFFSETS[dir];
	if (!offset) return false;
	const x = creep.pos.x + offset.dx;
	const y = creep.pos.y + offset.dy;
	if (x < 0 || x > 49 || y < 0 || y > 49) return true;

	const blocking = creep.room.lookForAt(LOOK_CREEPS, x, y)[0];
	if (!blocking) return true;

	if (getPushPriority(creep) >= getPushPriority(blocking)) return false;

	const dirs: DirectionConstant[] = [1, 2, 3, 4, 5, 6, 7, 8];
	for (const d of dirs) {
		const off = DIR_OFFSETS[d];
		const nx = blocking.pos.x + off.dx;
		const ny = blocking.pos.y + off.dy;
		if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
		const terrain = blocking.room.lookForAt(LOOK_TERRAIN, nx, ny)[0];
		if (terrain === 'wall') continue;
		if (blocking.room.lookForAt(LOOK_CREEPS, nx, ny).length > 0) continue;
		if (blocking.room.lookForAt(LOOK_STRUCTURES, nx, ny).some(s => !(s as any).isWalkable)) continue;

		const result = blocking.move(d);
		if (result === OK) {
			if (blocking.memory._path) {
				blocking.memory._path = oppositeDir(d) + blocking.memory._path;
			}
			return true;
		}
	}
	return false;
}

function recordTraffic(creep: Creep): void {
	const roomName = creep.room.name;
	if (!Memory.v1) return;
	const ns = Memory.v1;
	if (!ns.pathing) ns.pathing = {} as PathingMemory;
	if (!ns.pathing.traffic) ns.pathing.traffic = {};
	if (!ns.pathing.traffic[roomName]) ns.pathing.traffic[roomName] = {};

	const key = creep.pos.x + ',' + creep.pos.y;
	const heatmap = ns.pathing.traffic[roomName];
	heatmap[key] = (heatmap[key] || 0) + 1;

	if (heatmap[key] >= TRAFFIC_THRESHOLD) {
		if (!ns.pathing.pendingRoads) ns.pathing.pendingRoads = [];
		ns.pathing.pendingRoads.push({ roomName, x: creep.pos.x, y: creep.pos.y });
		heatmap[key] = 0;
	}
}

export function moveTo(creep: Creep, target: HasPos | RoomPosition, opts?: MoveOpts): ScreepsReturnCode {
	if (creep.fatigue > 0) return ERR_TIRED;
	if (creep.spawning) return ERR_BUSY;

	const dest = normalizePos(target);
	const range = opts?.range ?? 1;
	const rangeTo = creep.pos.getRangeTo(dest);

	if (rangeTo <= range) return ERR_NOT_IN_RANGE;

	if (!creep.memory._path) creep.memory._path = '';
	if (!creep.memory._stuckTicks) creep.memory._stuckTicks = 0;

	if (isStuck(creep)) {
		creep.memory._path = undefined;
		creep.memory._pathTick = undefined;
	}

	if (!creep.memory._path || creep.memory._path.length === 0) {
		const terrainCosts = getTerrainCosts(creep);
		const ret = findPath(creep.pos, dest, {
			...opts,
			terrainCosts,
			ignoreCreeps: true,
		});

		if (ret.incomplete) return ERR_NO_PATH;

		creep.memory._path = serializePath(creep.pos, ret.path);
	}

	if (!creep.memory._path || creep.memory._path.length === 0) return ERR_NO_PATH;

	const dir = parseInt(creep.memory._path[0], 10) as DirectionConstant;

	if (!tryPush(creep, dir)) {
		return ERR_BUSY;
	}

	const result = creep.move(dir);
	if (result === OK) {
		creep.memory._path = creep.memory._path.slice(1);
		recordTraffic(creep);
	}
	return result;
}
