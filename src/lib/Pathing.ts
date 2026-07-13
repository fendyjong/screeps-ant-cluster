import { CostMatrix } from 'screeps';
import { getTerrainMatrix } from './TerrainMatrix';

const pathCache: Record<string, CostMatrix> = {};
let cacheTick = -1;

function clearCache(): void {
	if (cacheTick !== Game.time) {
		for (const key in pathCache) delete pathCache[key];
		cacheTick = Game.time;
	}
}

function isCreepStuck(creep: Creep): boolean {
	if (!creep.memory._lastPos) {
		creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
		return false;
	}

	const last = creep.memory._lastPos;
	if (creep.pos.x === last.x && creep.pos.y === last.y && creep.room.name === last.roomName) {
		creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
	} else {
		creep.memory._stuckTicks = 0;
	}

	creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
	return (creep.memory._stuckTicks || 0) > 1;
}

function buildCostMatrix(room: Room): CostMatrix {
	clearCache();
	if (pathCache[room.name]) return pathCache[room.name];

	const base = getTerrainMatrix(room.name);
	const costs = new PathFinder.CostMatrix();

	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			costs.set(x, y, base.get(x, y));
		}
	}

	const structures = room.find(FIND_STRUCTURES);
	for (let i = 0; i < structures.length; i++) {
		const s = structures[i];
		const x = s.pos.x;
		const y = s.pos.y;
		if (s.structureType === STRUCTURE_ROAD) {
			costs.set(x, y, 1);
		} else if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART) {
			costs.set(x, y, 255);
		}
	}

	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (let i = 0; i < sites.length; i++) {
		const site = sites[i];
		if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_RAMPART) {
			costs.set(site.pos.x, site.pos.y, 255);
		}
	}

	const creeps = room.find(FIND_CREEPS);
	for (let i = 0; i < creeps.length; i++) {
		const c = creeps[i];
		costs.set(c.pos.x, c.pos.y, c.my ? 8 : 15);
	}

	pathCache[room.name] = costs;
	return costs;
}

export function moveTo(creep: Creep, target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): void {
	const stuck = isCreepStuck(creep);

	creep.moveTo(target, {
		visualizePathStyle: { stroke: '#ffffff' },
		reusePath: stuck ? 0 : 10,
		maxOps: stuck ? 2000 : 1200,
		ignoreCreeps: false,
		...opts,
		costCallback: (roomName: string, matrix: CostMatrix) => {
			if (roomName !== creep.room.name) return matrix;
			return buildCostMatrix(creep.room);
		},
	});
}
