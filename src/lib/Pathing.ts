import { CostMatrix } from 'screeps';
import { getTerrainMatrix } from './TerrainMatrix';
import { CURRENT_NS } from './Memory';



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

const TRAFFIC_THRESHOLD = 100;

function computeStructSig(room: Room): number {
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

function getOrBuildCostMatrix(room: Room): CostMatrix {
	const ns = Memory[CURRENT_NS];
	if (!ns.pathing) ns.pathing = {};
	if (!ns.pathing.costCache) ns.pathing.costCache = {};

	const currentSig = computeStructSig(room);
	const cached = ns.pathing.costCache[room.name] as { matrix: number[]; structSig: number } | undefined;

	if (cached && cached.structSig === currentSig) {
		return PathFinder.CostMatrix.deserialize(cached.matrix);
	}

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
		if (s.structureType === STRUCTURE_ROAD) {
			costs.set(s.pos.x, s.pos.y, 1);
		} else if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART) {
			costs.set(s.pos.x, s.pos.y, 255);
		}
	}

	const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
	for (let i = 0; i < sites.length; i++) {
		const site = sites[i];
		if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_RAMPART) {
			costs.set(site.pos.x, site.pos.y, 255);
		}
	}

	ns.pathing.costCache[room.name] = {
		matrix: costs.serialize(),
		structSig: currentSig,
	};

	return costs;
}

function recordTraffic(creep: Creep): void {
	const roomName = creep.room.name;
	const ns = Memory[CURRENT_NS];
	if (!ns.pathing) ns.pathing = {};
	if (!ns.pathing.traffic) ns.pathing.traffic = {};
	if (!ns.pathing.traffic[roomName]) ns.pathing.traffic[roomName] = {};

	const pos = creep.pos;
	const key = pos.x + ',' + pos.y;
	const heatmap = ns.pathing.traffic[roomName];
	heatmap[key] = (heatmap[key] || 0) + 1;

	if (heatmap[key] >= TRAFFIC_THRESHOLD) {
		if (!ns.pathing.pendingRoads) ns.pathing.pendingRoads = [];
		ns.pathing.pendingRoads.push({ roomName, x: pos.x, y: pos.y });
		heatmap[key] = 0;
	}
}

function giveWayIfStuck(creep: Creep): boolean {
	if (!creep.memory._stuckTicks || creep.memory._stuckTicks < 3) return false;
	if (creep.store.getUsedCapacity() === 0) return false;

	const dirs = [
		{ dx: -1, dy: 0 }, { dx: 1, dy: 0 },
		{ dx: 0, dy: -1 }, { dx: 0, dy: 1 },
	];

	for (const d of dirs) {
		const x = creep.pos.x + d.dx;
		const y = creep.pos.y + d.dy;
		if (x < 0 || x > 49 || y < 0 || y > 49) continue;
		const look = creep.room.lookForAt(LOOK_CREEPS, x, y);
		if (look.length > 0) continue;
		const terrain = creep.room.lookForAt(LOOK_TERRAIN, x, y);
		if (terrain[0] === 'wall') continue;
		creep.move(creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name)));
		return true;
	}

	return false;
}

export function moveTo(creep: Creep, target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): void {
	const stuck = isCreepStuck(creep);

	if (giveWayIfStuck(creep)) return;

	creep.moveTo(target, {
		visualizePathStyle: { stroke: '#ffffff' },
		reusePath: stuck ? 0 : 10,
		maxOps: stuck ? 2000 : 1200,
		ignoreCreeps: false,
		...opts,
		costCallback: (roomName: string, matrix: CostMatrix) => {
			if (roomName !== creep.room.name) return matrix;

			const cm = getOrBuildCostMatrix(creep.room);

			const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
			for (let i = 0; i < hostiles.length; i++) {
				const h = hostiles[i];
				cm.set(h.pos.x, h.pos.y, 255);
			}

			const friendlies = creep.room.find(FIND_MY_CREEPS);
			for (let i = 0; i < friendlies.length; i++) {
				const f = friendlies[i];
				if (cm.get(f.pos.x, f.pos.y) !== 255) {
					cm.set(f.pos.x, f.pos.y, 8);
				}
			}

			return cm;
		},
	});

	recordTraffic(creep);
}
