import { CostMatrix } from 'screeps';
import { CURRENT_NS } from './Memory';

export const TERRAIN_VERSION = 1;

export interface MoveOpts {
	maxRooms?: number;
	preferHighway?: boolean;
	avoidHostile?: boolean;
	ignoreCreeps?: boolean;
	range?: number;
	maxOps?: number;
	repath?: number;
	terrainCosts?: { plainCost: number; swampCost: number };
}

export function isWalkable(matrix: CostMatrix, x: number, y: number): boolean {
	if (x < 0 || x > 49 || y < 0 || y > 49) return false;
	return matrix.get(x, y) < 255;
}

export function getTerrainMatrix(roomName: string): CostMatrix {
	const ns = Memory[CURRENT_NS];
	if (!ns) { (Memory as any)[CURRENT_NS] = {}; }
	if (!ns.pathing) ns.pathing = {};
	if (!ns.pathing.terrain) ns.pathing.terrain = {};

	const cached = ns.pathing.terrain[roomName];
	if (cached && cached.version === TERRAIN_VERSION) {
		return PathFinder.CostMatrix.deserialize(cached.matrix);
	}

	const matrix = new PathFinder.CostMatrix();
	const terrain = Game.map.getRoomTerrain(roomName);
	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			const t = terrain.get(x, y);
			if (t === TERRAIN_MASK_WALL) {
				matrix.set(x, y, 255);
			} else if (t === TERRAIN_MASK_SWAMP) {
				matrix.set(x, y, 10);
			} else {
				matrix.set(x, y, 2);
			}
		}
	}

	ns.pathing.terrain[roomName] = {
		matrix: matrix.serialize(),
		tick: Game.time,
		version: TERRAIN_VERSION,
	};
	return matrix;
}

export function computeStructSig(room: Room): number {
	let sig = 0;
	const structures = room.find(FIND_STRUCTURES);
	for (let i = 0; i < structures.length; i++) {
		const s = structures[i];
		sig ^= s.structureType.charCodeAt(0) * (s.pos.x + 1) * (s.pos.y + 3);
	}
	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (let i = 0; i < sites.length; i++) {
		const s = sites[i];
		sig ^= s.structureType.charCodeAt(0) * (s.pos.x + 1) * (s.pos.y + 3) * 7;
	}
	return sig;
}

function getStructureMatrix(room: Room): CostMatrix {
	const ns = Memory[CURRENT_NS];
	if (!ns.pathing) ns.pathing = {};
	if (!ns.pathing.structureCache) ns.pathing.structureCache = {};

	const currentSig = computeStructSig(room);
	const cached = ns.pathing.structureCache[room.name] as { matrix: number[]; structSig: number } | undefined;

	if (cached && cached.structSig === currentSig) {
		return PathFinder.CostMatrix.deserialize(cached.matrix);
	}

	const matrix = getTerrainMatrix(room.name);
	const costs = new PathFinder.CostMatrix();
	for (let y = 0; y < 50; y++) {
		for (let x = 0; x < 50; x++) {
			costs.set(x, y, matrix.get(x, y));
		}
	}

	const structures = room.find(FIND_STRUCTURES);
	for (let i = 0; i < structures.length; i++) {
		const s = structures[i];
		if (s.structureType === STRUCTURE_ROAD) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (s.structureType === STRUCTURE_CONTAINER) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (s.structureType === STRUCTURE_RAMPART && s.my) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (!(s as any).isWalkable) {
			costs.set(s.pos.x, s.pos.y, 255);
		}
	}

	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (let i = 0; i < sites.length; i++) {
		const site = sites[i];
		if (!(site as any).isWalkable) {
			costs.set(site.pos.x, site.pos.y, 255);
		}
	}

	ns.pathing.structureCache[room.name] = {
		matrix: costs.serialize(),
		structSig: currentSig,
	};
	return costs;
}

export function findRoute(
	origin: string,
	destination: string,
	opts: MoveOpts = {}
): { [roomName: string]: boolean } | undefined {
	const highwayBias = opts.preferHighway ? 2.5 : 1;
	const restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 10;

	const ret = (Game.map as any).findRoute(origin, destination, {
		routeCallback: (roomName: string) => {
			const range = Game.map.getRoomLinearDistance(origin, roomName);
			if (range > restrictDistance) return Number.POSITIVE_INFINITY;

			if (opts.avoidHostile !== false) {
				const mem = Memory.rooms?.[roomName];
				if (mem && (mem as any).avoid && roomName !== destination && roomName !== origin) {
					return Number.POSITIVE_INFINITY;
				}
			}
			return highwayBias;
		},
	});

	if (!Array.isArray(ret)) return undefined;

	const allowedRooms: { [roomName: string]: boolean } = { [origin]: true, [destination]: true };
	for (const value of ret) {
		allowedRooms[(value as any).room] = true;
	}
	return allowedRooms;
}

export function findPath(
	origin: RoomPosition,
	destination: RoomPosition,
	opts: MoveOpts = {}
): PathFinderPath {
	const defaults: MoveOpts = {
		ignoreCreeps: true,
		maxOps: 20000,
		range: 1,
		terrainCosts: { plainCost: 2, swampCost: 10 },
	};
	const options = { ...defaults, ...opts };

	const roomDistance = Game.map.getRoomLinearDistance(origin.roomName, destination.roomName);
	const useRoute = options.maxRooms !== 1 && (roomDistance > 2 || (options.maxRooms && options.maxRooms > 1));
	const allowedRooms = useRoute ? findRoute(origin.roomName, destination.roomName, options) : undefined;

	const roomCallback = (roomName: string): CostMatrix | boolean => {
		if (allowedRooms && !allowedRooms[roomName]) return false;

		if (options.avoidHostile !== false) {
			const mem = Memory.rooms?.[roomName];
			if (mem && (mem as any).avoid && roomName !== origin.roomName && roomName !== destination.roomName) {
				return false;
			}
		}

		const room = Game.rooms[roomName];
		if (room) {
			return getStructureMatrix(room);
		}
		return true;
	};

	return PathFinder.search(origin, { pos: destination, range: options.range! }, {
		maxOps: options.maxOps,
		maxRooms: options.maxRooms,
		plainCost: options.terrainCosts!.plainCost,
		swampCost: options.terrainCosts!.swampCost,
		roomCallback,
	});
}