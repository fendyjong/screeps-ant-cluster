import {getCutTiles, Rectangle} from '../algorithms/minCut';
import {Pathing} from '../movement/Pathing';
import {profile} from '../profiler/decorator';
import {StructureMap} from './RoomPlanner';

interface DynamicPlanScore {
	logistics: number;
	defense: number;
	capacity: number;
	terrain: number;
	total: number;
}

export interface DynamicPlanCandidate {
	anchor: RoomPosition;
	map: StructureMap;
	ramparts: RoomPosition[];
	roads: RoomPosition[];
	extensionFields: RoomPosition[];
	score: DynamicPlanScore;
}

const CANDIDATE_LIMIT = 8;
const CORE_RADIUS = 4;
const PROTECTION_RADIUS = 8;
const MIN_PROTECTED_BUILDABLE_TILES = 110;

const SCORE_WEIGHTS = {
	logistics: 0.45,
	defense : 0.35,
	capacity: 0.15,
	terrain : 0.05,
};

@profile
export class DynamicPlanner {
	private static isBuildable(terrain: RoomTerrain, x: number, y: number): boolean {
		return x > 1 && x < 48 && y > 1 && y < 48 && terrain.get(x, y) != TERRAIN_MASK_WALL;
	}

	private static terrainPenalty(terrain: RoomTerrain, pos: RoomPosition): number {
		return terrain.get(pos.x, pos.y) == TERRAIN_MASK_SWAMP ? 5 : 1;
	}

	private static positionsInRange(roomName: string, center: RoomPosition, range: number): RoomPosition[] {
		const terrain = Game.map.getRoomTerrain(roomName);
		const positions: RoomPosition[] = [];
		for (let x = Math.max(2, center.x - range); x <= Math.min(47, center.x + range); x++) {
			for (let y = Math.max(2, center.y - range); y <= Math.min(47, center.y + range); y++) {
				if (this.isBuildable(terrain, x, y)) {
					positions.push(new RoomPosition(x, y, roomName));
				}
			}
		}
		return positions;
	}

	private static logisticCentroid(room: Room): RoomPosition {
		const points = (_.compact([...room.sources, room.controller]) as RoomObject[]).map(obj => obj.pos);
		const x = Math.round(_.sum(points, pos => pos.x) / points.length);
		const y = Math.round(_.sum(points, pos => pos.y) / points.length);
		return new RoomPosition(Math.max(2, Math.min(47, x)), Math.max(2, Math.min(47, y)), room.name);
	}

	private static wallAdjacency(terrain: RoomTerrain, pos: RoomPosition): number {
		let walls = 0;
		for (let x = pos.x - CORE_RADIUS; x <= pos.x + CORE_RADIUS; x++) {
			for (let y = pos.y - CORE_RADIUS; y <= pos.y + CORE_RADIUS; y++) {
				if (terrain.get(x, y) == TERRAIN_MASK_WALL) walls++;
			}
		}
		return walls;
	}

	private static coreCandidates(room: Room): RoomPosition[] {
		const terrain = Game.map.getRoomTerrain(room.name);
		const centroid = this.logisticCentroid(room);
		const obstacles = this.occupiedPositions(room);
		const candidates: {
			pos: RoomPosition,
			logistics: number,
			defense: number,
			capacity: number,
			terrain: number,
		}[] = [];
		for (let x = PROTECTION_RADIUS + 2; x <= 47 - PROTECTION_RADIUS; x++) {
			for (let y = PROTECTION_RADIUS + 2; y <= 47 - PROTECTION_RADIUS; y++) {
				if (!this.isBuildable(terrain, x, y)) continue;
				const pos = new RoomPosition(x, y, room.name);
				if (_.any(obstacles, obstacle => pos.getRangeTo(obstacle) <= CORE_RADIUS)) continue;
				const localBuildable = this.positionsInRange(room.name, pos, CORE_RADIUS).length;
				if (localBuildable < 18) continue;
				const protectedTiles = this.positionsInRange(room.name, pos, PROTECTION_RADIUS);
				const swamps = _.filter(protectedTiles,
					field => terrain.get(field.x, field.y) == TERRAIN_MASK_SWAMP).length;
				candidates.push({
					pos,
					logistics: pos.getRangeTo(centroid),
					defense : Math.max(0, 81 - this.wallAdjacency(terrain, pos)),
					capacity: Math.max(0, MIN_PROTECTED_BUILDABLE_TILES - protectedTiles.length),
					terrain : protectedTiles.length > 0 ? swamps / protectedTiles.length : 1,
				});
			}
		}
		const normalize = (value: number, values: number[]) => {
			const min = _.min(values);
			const max = _.max(values);
			return max > min ? (value - min) / (max - min) : 0;
		};
		const logistics = _.map(candidates, candidate => candidate.logistics);
		const defense = _.map(candidates, candidate => candidate.defense);
		const capacity = _.map(candidates, candidate => candidate.capacity);
		const terrainScores = _.map(candidates, candidate => candidate.terrain);
		return _.map(_.take(_.sortBy(candidates, candidate =>
			normalize(candidate.logistics, logistics) * SCORE_WEIGHTS.logistics
			+ normalize(candidate.defense, defense) * SCORE_WEIGHTS.defense
			+ normalize(candidate.capacity, capacity) * SCORE_WEIGHTS.capacity
			+ normalize(candidate.terrain, terrainScores) * SCORE_WEIGHTS.terrain), CANDIDATE_LIMIT), candidate => candidate.pos);
	}

	private static pathCost(origin: RoomPosition, target: RoomPosition): number {
		const ret = Pathing.findPath(origin, target, {
			ignoreStructures: true,
			allowHostile    : true,
			blockExits      : true,
			maxRooms        : 1,
			terrainCosts    : {plainCost: 1, swampCost: 5},
		});
		return ret.incomplete ? 10000 : ret.cost;
	}

	private static logisticsScore(room: Room, anchor: RoomPosition): number {
		const sourceCost = _.sum(room.sources, source => this.pathCost(anchor, source.pos));
		const controllerCost = room.controller ? this.pathCost(anchor, room.controller.pos) : 10000;
		return sourceCost + controllerCost;
	}

	private static terrainScore(room: Room, anchor: RoomPosition): number {
		const terrain = Game.map.getRoomTerrain(room.name);
		const positions = this.positionsInRange(room.name, anchor, PROTECTION_RADIUS);
		if (positions.length == 0) return 10000;
		const swamps = _.filter(positions, pos => terrain.get(pos.x, pos.y) == TERRAIN_MASK_SWAMP).length;
		return 100 * swamps / positions.length;
	}

	private static protectionRect(anchor: RoomPosition): Rectangle {
		return {
			x1: Math.max(anchor.x - PROTECTION_RADIUS, 2),
			y1: Math.max(anchor.y - PROTECTION_RADIUS, 2),
			x2: Math.min(anchor.x + PROTECTION_RADIUS, 47),
			y2: Math.min(anchor.y + PROTECTION_RADIUS, 47),
		};
	}

	private static rampartsForAnchor(room: Room, anchor: RoomPosition): RoomPosition[] {
		const rect = this.protectionRect(anchor);
		const cutTiles = getCutTiles(room.name, [rect], false, Infinity, false);
		return _.map(cutTiles, coord => new RoomPosition(coord.x, coord.y, room.name));
	}

	private static rampartExposure(room: Room, ramparts: RoomPosition[]): number {
		const terrain = Game.map.getRoomTerrain(room.name);
		const barriers: {[coord: string]: boolean} = {};
		for (const rampart of ramparts) barriers[`${rampart.x}:${rampart.y}`] = true;
		const exterior: {[coord: string]: boolean} = {};
		const queue: Coord[] = [];
		const enqueue = (x: number, y: number) => {
			const key = `${x}:${y}`;
			if (exterior[key] || barriers[key] || terrain.get(x, y) == TERRAIN_MASK_WALL) return;
			exterior[key] = true;
			queue.push({x, y});
		};
		for (let i = 0; i < 50; i++) {
			enqueue(0, i);
			enqueue(49, i);
			enqueue(i, 0);
			enqueue(i, 49);
		}
		while (queue.length > 0) {
			const current = queue.shift()!;
			if (current.x > 0) enqueue(current.x - 1, current.y);
			if (current.x < 49) enqueue(current.x + 1, current.y);
			if (current.y > 0) enqueue(current.x, current.y - 1);
			if (current.y < 49) enqueue(current.x, current.y + 1);
		}
		let exposure = 0;
		for (const rampart of ramparts) {
			if (exterior[`${rampart.x - 1}:${rampart.y}`]) exposure++;
			if (exterior[`${rampart.x + 1}:${rampart.y}`]) exposure++;
			if (exterior[`${rampart.x}:${rampart.y - 1}`]) exposure++;
			if (exterior[`${rampart.x}:${rampart.y + 1}`]) exposure++;
		}
		return exposure;
	}

	private static occupiedPositions(room: Room): RoomPosition[] {
		const roomObjects = (_.compact([...room.sources, room.controller, room.mineral]) as RoomObject[]).map(obj => obj.pos);
		const structures = room.find(FIND_STRUCTURES).map(structure => structure.pos);
		const sites = room.find(FIND_CONSTRUCTION_SITES).map(site => site.pos);
		return roomObjects.concat(structures, sites);
	}

	private static capacityScore(room: Room, anchor: RoomPosition,
								 ramparts: RoomPosition[]): { score: number, fields: RoomPosition[] } {
		const occupied = this.occupiedPositions(room).concat(ramparts);
		const fields = _.filter(this.positionsInRange(room.name, anchor, PROTECTION_RADIUS),
			pos => !_.any(occupied, occupiedPos => occupiedPos.isEqualTo(pos)));
		const score = fields.length < MIN_PROTECTED_BUILDABLE_TILES ? Infinity : 10000 / fields.length;
		return {score, fields};
	}

	private static buildSeedMap(room: Room, anchor: RoomPosition, extensionFields: RoomPosition[],
									 ramparts: RoomPosition[]): StructureMap | undefined {
		const terrain = Game.map.getRoomTerrain(room.name);
		const map: StructureMap = {};
		const nearby = this.positionsInRange(room.name, anchor, 2);
		const reserved = this.occupiedPositions(room).concat(ramparts);
		const available = (pos: RoomPosition) => !_.any(reserved, reservedPos => reservedPos.isEqualTo(pos));
		const spawn = _.find(_.sortBy(nearby, pos => this.terrainPenalty(terrain, pos)),
			pos => available(pos) && pos.getRangeTo(anchor) == 1);
		const tower = _.find(_.sortBy(nearby, pos => this.terrainPenalty(terrain, pos)),
			pos => available(pos) && pos.getRangeTo(anchor) == 2 && (!spawn || !pos.isEqualTo(spawn)));
		const roads = _.filter(nearby, pos => available(pos) && pos.getRangeTo(anchor) == 1
			&& (!spawn || !pos.isEqualTo(spawn)));
		const occupied = (_.compact([anchor, spawn, tower]) as RoomPosition[]).concat(roads);
		const extensions = _.take(_.filter(_.sortBy(extensionFields,
			pos => pos.getRangeTo(anchor) + this.terrainPenalty(terrain, pos)),
			pos => available(pos) && pos.getRangeTo(anchor) > 2
				&& !_.any(occupied, occupiedPos => occupiedPos.isEqualTo(pos))), 20);
		if (!available(anchor) || !spawn || !tower || extensions.length < 20) return;

		map[STRUCTURE_STORAGE] = [anchor];
		map[STRUCTURE_SPAWN] = spawn ? [spawn] : [];
		map[STRUCTURE_TOWER] = tower ? [tower] : [];
		map[STRUCTURE_EXTENSION] = extensions;
		map[STRUCTURE_ROAD] = roads;
		return map;
	}

	static plan(room: Room): DynamicPlanCandidate | undefined {
		if (!room.controller || room.sources.length == 0) return;
		let best: DynamicPlanCandidate | undefined;
		for (const anchor of this.coreCandidates(room)) {
			const logistics = this.logisticsScore(room, anchor);
			const ramparts = this.rampartsForAnchor(room, anchor);
			const occupied = this.occupiedPositions(room);
			if (ramparts.length == 0 || _.any(ramparts,
				rampart => _.any(occupied, occupiedPos => occupiedPos.isEqualTo(rampart)))) continue;
			const defense = ramparts.length * 10 + this.rampartExposure(room, ramparts) * 5;
			const capacity = this.capacityScore(room, anchor, ramparts);
			if (!Number.isFinite(capacity.score)) continue;
			const terrain = this.terrainScore(room, anchor);
			const total = logistics * SCORE_WEIGHTS.logistics
				+ defense * SCORE_WEIGHTS.defense
				+ capacity.score * SCORE_WEIGHTS.capacity
				+ terrain * SCORE_WEIGHTS.terrain;
			const map = this.buildSeedMap(room, anchor, capacity.fields, ramparts);
			if (!map) continue;
			const candidate: DynamicPlanCandidate = {
				anchor,
				map,
				ramparts,
				roads          : map[STRUCTURE_ROAD] || [],
				extensionFields: capacity.fields,
				score          : {logistics, defense, capacity: capacity.score, terrain, total},
			};
			if (!best || candidate.score.total < best.score.total) best = candidate;
		}
		return best;
	}
}
