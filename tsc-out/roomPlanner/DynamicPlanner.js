var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { getCutTiles } from '../algorithms/minCut';
import { Pathing } from '../movement/Pathing';
import { profile } from '../profiler/decorator';
const CANDIDATE_LIMIT = 8;
const CORE_RADIUS = 4;
const PROTECTION_RADIUS = 8;
const MIN_PROTECTED_BUILDABLE_TILES = 110;
const SCORE_WEIGHTS = {
    logistics: 0.45,
    defense: 0.35,
    capacity: 0.15,
    terrain: 0.05,
};
let DynamicPlanner = class DynamicPlanner {
    static isBuildable(terrain, x, y) {
        return x > 1 && x < 48 && y > 1 && y < 48 && terrain.get(x, y) != TERRAIN_MASK_WALL;
    }
    static terrainPenalty(terrain, pos) {
        return terrain.get(pos.x, pos.y) == TERRAIN_MASK_SWAMP ? 5 : 1;
    }
    static positionsInRange(roomName, center, range) {
        const terrain = Game.map.getRoomTerrain(roomName);
        const positions = [];
        for (let x = Math.max(2, center.x - range); x <= Math.min(47, center.x + range); x++) {
            for (let y = Math.max(2, center.y - range); y <= Math.min(47, center.y + range); y++) {
                if (this.isBuildable(terrain, x, y)) {
                    positions.push(new RoomPosition(x, y, roomName));
                }
            }
        }
        return positions;
    }
    static logisticCentroid(room) {
        const points = _.compact([...room.sources, room.controller]).map(obj => obj.pos);
        const x = Math.round(_.sum(points, pos => pos.x) / points.length);
        const y = Math.round(_.sum(points, pos => pos.y) / points.length);
        return new RoomPosition(Math.max(2, Math.min(47, x)), Math.max(2, Math.min(47, y)), room.name);
    }
    static wallAdjacency(terrain, pos) {
        let walls = 0;
        for (let x = pos.x - CORE_RADIUS; x <= pos.x + CORE_RADIUS; x++) {
            for (let y = pos.y - CORE_RADIUS; y <= pos.y + CORE_RADIUS; y++) {
                if (terrain.get(x, y) == TERRAIN_MASK_WALL)
                    walls++;
            }
        }
        return walls;
    }
    static coreCandidates(room) {
        const terrain = Game.map.getRoomTerrain(room.name);
        const centroid = this.logisticCentroid(room);
        const obstacles = this.occupiedPositions(room);
        const candidates = [];
        for (let x = PROTECTION_RADIUS + 2; x <= 47 - PROTECTION_RADIUS; x++) {
            for (let y = PROTECTION_RADIUS + 2; y <= 47 - PROTECTION_RADIUS; y++) {
                if (!this.isBuildable(terrain, x, y))
                    continue;
                const pos = new RoomPosition(x, y, room.name);
                if (_.any(obstacles, obstacle => pos.getRangeTo(obstacle) <= CORE_RADIUS))
                    continue;
                const localBuildable = this.positionsInRange(room.name, pos, CORE_RADIUS).length;
                if (localBuildable < 18)
                    continue;
                const protectedTiles = this.positionsInRange(room.name, pos, PROTECTION_RADIUS);
                const swamps = _.filter(protectedTiles, field => terrain.get(field.x, field.y) == TERRAIN_MASK_SWAMP).length;
                candidates.push({
                    pos,
                    logistics: pos.getRangeTo(centroid),
                    defense: Math.max(0, 81 - this.wallAdjacency(terrain, pos)),
                    capacity: Math.max(0, MIN_PROTECTED_BUILDABLE_TILES - protectedTiles.length),
                    terrain: protectedTiles.length > 0 ? swamps / protectedTiles.length : 1,
                });
            }
        }
        const normalize = (value, values) => {
            const min = _.min(values);
            const max = _.max(values);
            return max > min ? (value - min) / (max - min) : 0;
        };
        const logistics = _.map(candidates, candidate => candidate.logistics);
        const defense = _.map(candidates, candidate => candidate.defense);
        const capacity = _.map(candidates, candidate => candidate.capacity);
        const terrainScores = _.map(candidates, candidate => candidate.terrain);
        return _.map(_.take(_.sortBy(candidates, candidate => normalize(candidate.logistics, logistics) * SCORE_WEIGHTS.logistics
            + normalize(candidate.defense, defense) * SCORE_WEIGHTS.defense
            + normalize(candidate.capacity, capacity) * SCORE_WEIGHTS.capacity
            + normalize(candidate.terrain, terrainScores) * SCORE_WEIGHTS.terrain), CANDIDATE_LIMIT), candidate => candidate.pos);
    }
    static pathCost(origin, target) {
        const ret = Pathing.findPath(origin, target, {
            ignoreStructures: true,
            allowHostile: true,
            blockExits: true,
            maxRooms: 1,
            terrainCosts: { plainCost: 1, swampCost: 5 },
        });
        return ret.incomplete ? 10000 : ret.cost;
    }
    static logisticsScore(room, anchor) {
        const sourceCost = _.sum(room.sources, source => this.pathCost(anchor, source.pos));
        const controllerCost = room.controller ? this.pathCost(anchor, room.controller.pos) : 10000;
        return sourceCost + controllerCost;
    }
    static terrainScore(room, anchor) {
        const terrain = Game.map.getRoomTerrain(room.name);
        const positions = this.positionsInRange(room.name, anchor, PROTECTION_RADIUS);
        if (positions.length == 0)
            return 10000;
        const swamps = _.filter(positions, pos => terrain.get(pos.x, pos.y) == TERRAIN_MASK_SWAMP).length;
        return 100 * swamps / positions.length;
    }
    static protectionRect(anchor) {
        return {
            x1: Math.max(anchor.x - PROTECTION_RADIUS, 2),
            y1: Math.max(anchor.y - PROTECTION_RADIUS, 2),
            x2: Math.min(anchor.x + PROTECTION_RADIUS, 47),
            y2: Math.min(anchor.y + PROTECTION_RADIUS, 47),
        };
    }
    static rampartsForAnchor(room, anchor) {
        const rect = this.protectionRect(anchor);
        const cutTiles = getCutTiles(room.name, [rect], false, Infinity, false);
        return _.map(cutTiles, coord => new RoomPosition(coord.x, coord.y, room.name));
    }
    static rampartExposure(room, ramparts) {
        const terrain = Game.map.getRoomTerrain(room.name);
        const barriers = {};
        for (const rampart of ramparts)
            barriers[`${rampart.x}:${rampart.y}`] = true;
        const exterior = {};
        const queue = [];
        const enqueue = (x, y) => {
            const key = `${x}:${y}`;
            if (exterior[key] || barriers[key] || terrain.get(x, y) == TERRAIN_MASK_WALL)
                return;
            exterior[key] = true;
            queue.push({ x, y });
        };
        for (let i = 0; i < 50; i++) {
            enqueue(0, i);
            enqueue(49, i);
            enqueue(i, 0);
            enqueue(i, 49);
        }
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.x > 0)
                enqueue(current.x - 1, current.y);
            if (current.x < 49)
                enqueue(current.x + 1, current.y);
            if (current.y > 0)
                enqueue(current.x, current.y - 1);
            if (current.y < 49)
                enqueue(current.x, current.y + 1);
        }
        let exposure = 0;
        for (const rampart of ramparts) {
            if (exterior[`${rampart.x - 1}:${rampart.y}`])
                exposure++;
            if (exterior[`${rampart.x + 1}:${rampart.y}`])
                exposure++;
            if (exterior[`${rampart.x}:${rampart.y - 1}`])
                exposure++;
            if (exterior[`${rampart.x}:${rampart.y + 1}`])
                exposure++;
        }
        return exposure;
    }
    static occupiedPositions(room) {
        const roomObjects = _.compact([...room.sources, room.controller, room.mineral]).map(obj => obj.pos);
        const structures = room.find(FIND_STRUCTURES).map(structure => structure.pos);
        const sites = room.find(FIND_CONSTRUCTION_SITES).map(site => site.pos);
        return roomObjects.concat(structures, sites);
    }
    static capacityScore(room, anchor, ramparts) {
        const occupied = this.occupiedPositions(room).concat(ramparts);
        const fields = _.filter(this.positionsInRange(room.name, anchor, PROTECTION_RADIUS), pos => !_.any(occupied, occupiedPos => occupiedPos.isEqualTo(pos)));
        const score = fields.length < MIN_PROTECTED_BUILDABLE_TILES ? Infinity : 10000 / fields.length;
        return { score, fields };
    }
    static buildSeedMap(room, anchor, extensionFields, ramparts) {
        const terrain = Game.map.getRoomTerrain(room.name);
        const map = {};
        const nearby = this.positionsInRange(room.name, anchor, 2);
        const reserved = this.occupiedPositions(room).concat(ramparts);
        const available = (pos) => !_.any(reserved, reservedPos => reservedPos.isEqualTo(pos));
        const spawn = _.find(_.sortBy(nearby, pos => this.terrainPenalty(terrain, pos)), pos => available(pos) && pos.getRangeTo(anchor) == 1);
        const tower = _.find(_.sortBy(nearby, pos => this.terrainPenalty(terrain, pos)), pos => available(pos) && pos.getRangeTo(anchor) == 2 && (!spawn || !pos.isEqualTo(spawn)));
        const roads = _.filter(nearby, pos => available(pos) && pos.getRangeTo(anchor) == 1
            && (!spawn || !pos.isEqualTo(spawn)));
        const occupied = _.compact([anchor, spawn, tower]).concat(roads);
        const extensions = _.take(_.filter(_.sortBy(extensionFields, pos => pos.getRangeTo(anchor) + this.terrainPenalty(terrain, pos)), pos => available(pos) && pos.getRangeTo(anchor) > 2
            && !_.any(occupied, occupiedPos => occupiedPos.isEqualTo(pos))), 20);
        if (!available(anchor) || !spawn || !tower || extensions.length < 20)
            return;
        map[STRUCTURE_STORAGE] = [anchor];
        map[STRUCTURE_SPAWN] = spawn ? [spawn] : [];
        map[STRUCTURE_TOWER] = tower ? [tower] : [];
        map[STRUCTURE_EXTENSION] = extensions;
        map[STRUCTURE_ROAD] = roads;
        return map;
    }
    static plan(room) {
        if (!room.controller || room.sources.length == 0)
            return;
        let best;
        for (const anchor of this.coreCandidates(room)) {
            const logistics = this.logisticsScore(room, anchor);
            const ramparts = this.rampartsForAnchor(room, anchor);
            const occupied = this.occupiedPositions(room);
            if (ramparts.length == 0 || _.any(ramparts, rampart => _.any(occupied, occupiedPos => occupiedPos.isEqualTo(rampart))))
                continue;
            const defense = ramparts.length * 10 + this.rampartExposure(room, ramparts) * 5;
            const capacity = this.capacityScore(room, anchor, ramparts);
            if (!Number.isFinite(capacity.score))
                continue;
            const terrain = this.terrainScore(room, anchor);
            const total = logistics * SCORE_WEIGHTS.logistics
                + defense * SCORE_WEIGHTS.defense
                + capacity.score * SCORE_WEIGHTS.capacity
                + terrain * SCORE_WEIGHTS.terrain;
            const map = this.buildSeedMap(room, anchor, capacity.fields, ramparts);
            if (!map)
                continue;
            const candidate = {
                anchor,
                map,
                ramparts,
                roads: map[STRUCTURE_ROAD] || [],
                extensionFields: capacity.fields,
                score: { logistics, defense, capacity: capacity.score, terrain, total },
            };
            if (!best || candidate.score.total < best.score.total)
                best = candidate;
        }
        return best;
    }
};
DynamicPlanner = __decorate([
    profile
], DynamicPlanner);
export { DynamicPlanner };
