// Room intel - provides information related to room structure and occupation
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RoomIntel_1;
import { profile } from '../profiler/decorator';
import { ExpansionEvaluator } from '../strategy/ExpansionEvaluator';
import { Cartographer, ROOMTYPE_CORE } from '../utilities/Cartographer';
import { packCoord, packCoordList, packId, packPos, unpackCoordAsPos, unpackCoordListAsPosList, unpackPos } from '../utilities/packrat';
import { ema, getCacheExpiration } from '../utilities/utils';
import { CombatIntel } from './CombatIntel';
const RECACHE_TIME = 5000;
const OWNED_RECACHE_TIME = 1000;
const ROOM_CREEP_HISTORY_TICKS = 25;
const SCORE_RECALC_PROB = 0.05;
const FALSE_SCORE_RECALC_PROB = 0.01;
const defaultRoomIntelMemory = {
    portalRooms: [],
};
let RoomIntel = RoomIntel_1 = class RoomIntel {
    constructor() {
        _.defaultsDeep(Memory.roomIntel, defaultRoomIntelMemory);
    }
    // Making this a static getter prevents us from having to call Overmind.roomIntel.whatever() all the time
    static get memory() {
        return Memory.roomIntel;
    }
    static cleanMemory() {
        // // Clean out memory of inactive portals // this actually gets done automatically with recordPermanentObjects
        // for (const portalRoomName in this.memory.portalRooms) {
        // 	const portals = this.memory.portalRooms[portalRoomName];
        // 	if (portals) {
        // 		for (const portal of portals) {
        // 			if (portal[MEM.EXPIRATION]) {
        // 				// TODO
        // 			}
        // 		}
        // 	}
        // }
    }
    /**
     * Mark a room as being visible this tick
     */
    static markVisible(room) {
        room.memory["T" /* MEM.TICK */] = Game.time;
    }
    /**
     * Returns the last tick at which the room was visible, or -100
     */
    static lastVisible(roomName) {
        if (Memory.rooms[roomName]) {
            return Memory.rooms[roomName]["T" /* MEM.TICK */] || -100;
        }
        else {
            return -100;
        }
    }
    /**
     * Gets expansion data from a room in readable format. Undefined means that a data is not present, while false
     * means that the room has been analyzed and determined to be unsuitable for expansion. Be sure to use === when
     * comparing to false!
     */
    static getExpansionData(roomName) {
        if (!Memory.rooms[roomName] || !Memory.rooms[roomName]["e" /* RMEM.EXPANSION_DATA */]) {
            return;
        }
        const data = Memory.rooms[roomName]["e" /* RMEM.EXPANSION_DATA */];
        if (data === 0) {
            return false;
        }
        return {
            score: data["s" /* RMEM_EXPANSION_DATA.SCORE */],
            bunkerAnchor: unpackCoordAsPos(data["a" /* RMEM_EXPANSION_DATA.BUNKER_ANCHOR */], roomName),
            outposts: data["o" /* RMEM_EXPANSION_DATA.OUTPOSTS */]
        };
    }
    /**
     * Sets expansion data for a room. Setting the data to false marks the room as uninhabitable.
     */
    static setExpansionData(roomName, data) {
        Memory.rooms[roomName] = Memory.rooms[roomName] || {};
        if (data === false) {
            Memory.rooms[roomName]["e" /* RMEM.EXPANSION_DATA */] = 0;
        }
        else {
            Memory.rooms[roomName]["e" /* RMEM.EXPANSION_DATA */] = {
                ["s" /* RMEM_EXPANSION_DATA.SCORE */]: data.score,
                ["a" /* RMEM_EXPANSION_DATA.BUNKER_ANCHOR */]: packCoord(data.bunkerAnchor),
                ["o" /* RMEM_EXPANSION_DATA.OUTPOSTS */]: data.outposts,
            };
        }
    }
    /**
     * Returns information about intra-shard portals in a given room
     */
    static getPortalInfo(roomName) {
        if (!Memory.rooms[roomName] || !Memory.rooms[roomName]["pr" /* RMEM.PORTALS */]) {
            return [];
        }
        const localPortals = _.filter(Memory.rooms[roomName]["pr" /* RMEM.PORTALS */], savedPortal => typeof savedPortal.dest == 'string');
        const nonExpiredPortals = _.filter(localPortals, portal => Game.time < portal["X" /* MEM.EXPIRATION */]);
        return _.map(nonExpiredPortals, savedPortal => {
            const pos = unpackCoordAsPos(savedPortal.c, roomName);
            const destinationPos = unpackPos(savedPortal.dest);
            const expiration = savedPortal["X" /* MEM.EXPIRATION */];
            return { pos: pos, destination: destinationPos, expiration: expiration };
        });
    }
    /**
     * Returns information about intra-shard portals in a given room
     */
    static getSourceInfo(roomName) {
        if (!Memory.rooms[roomName] || !Memory.rooms[roomName]["s" /* RMEM.SOURCES */]) {
            return;
        }
        return _.map(Memory.rooms[roomName]["s" /* RMEM.SOURCES */], savedSource => ({
            pos: unpackCoordAsPos(savedSource.c, roomName),
            containerPos: savedSource.cn ? unpackCoordAsPos(savedSource.cn, roomName) : undefined
        }));
    }
    /**
     * Returns information about intra-shard portals in a given room
     */
    static getKeeperLairInfo(roomName) {
        if (!Memory.rooms[roomName] || !Memory.rooms[roomName]["k" /* RMEM.SKLAIRS */]) {
            return;
        }
        return _.map(Memory.rooms[roomName]["k" /* RMEM.SKLAIRS */], savedLair => ({
            pos: unpackCoordAsPos(savedLair.c, roomName),
            chillPos: savedLair.cp ? unpackCoordAsPos(savedLair.cp, roomName) : undefined
        }));
    }
    /**
     * Unpackages saved information about a room's controller
     */
    static getControllerInfo(roomName) {
        if (!Memory.rooms[roomName] || !Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]) {
            return;
        }
        const ctlr = Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */];
        return {
            pos: unpackCoordAsPos(ctlr.c, roomName),
            level: ctlr["l" /* RMEM_CTRL.LEVEL */],
            owner: ctlr["o" /* RMEM_CTRL.OWNER */],
            reservation: ctlr["r" /* RMEM_CTRL.RESERVATION */] ? {
                username: ctlr["r" /* RMEM_CTRL.RESERVATION */]["u" /* RMEM_CTRL.RES_USERNAME */],
                ticksToEnd: ctlr["r" /* RMEM_CTRL.RESERVATION */]["t" /* RMEM_CTRL.RES_TICKSTOEND */],
            } : undefined,
            safemode: ctlr["s" /* RMEM_CTRL.SAFEMODE */],
            safemodeAvailable: ctlr["sa" /* RMEM_CTRL.SAFEMODE_AVAILABLE */],
            safemodeCooldown: ctlr["sc" /* RMEM_CTRL.SAFEMODE_COOLDOWN */],
            progress: ctlr["p" /* RMEM_CTRL.PROGRESS */],
            progressTotal: ctlr["pt" /* RMEM_CTRL.PROGRESS_TOTAL */],
        };
    }
    static getImportantStructureInfo(roomName) {
        if (!Memory.rooms[roomName] || !Memory.rooms[roomName]["i" /* RMEM.IMPORTANT_STRUCTURES */]) {
            return;
        }
        const data = Memory.rooms[roomName]["i" /* RMEM.IMPORTANT_STRUCTURES */];
        return {
            storagePos: data["s" /* RMEM_STRUCTS.STORAGE */] ?
                unpackCoordAsPos(data["s" /* RMEM_STRUCTS.STORAGE */], roomName) : undefined,
            terminalPos: data["e" /* RMEM_STRUCTS.TERMINAL */] ?
                unpackCoordAsPos(data["e" /* RMEM_STRUCTS.TERMINAL */], roomName) : undefined,
            towerPositions: unpackCoordListAsPosList(data["t" /* RMEM_STRUCTS.TOWERS */], roomName),
            spawnPositions: unpackCoordListAsPosList(data["sp" /* RMEM_STRUCTS.SPAWNS */], roomName),
            wallPositions: unpackCoordListAsPosList(data["w" /* RMEM_STRUCTS.WALLS */], roomName),
            rampartPositions: unpackCoordListAsPosList(data["r" /* RMEM_STRUCTS.RAMPARTS */], roomName),
        };
    }
    /**
     * Retrieves all info for permanent room objects and returns it in a more readable/useful form
     */
    static getAllRoomObjectInfo(roomName) {
        const mem = Memory.rooms[roomName];
        if (mem) {
            const savedController = mem["c" /* RMEM.CONTROLLER */];
            const savedSources = mem["s" /* RMEM.SOURCES */] || [];
            const savedMineral = mem["m" /* RMEM.MINERAL */];
            const savedSkLairs = mem["k" /* RMEM.SKLAIRS */] || [];
            const savedImportantStructures = mem["i" /* RMEM.IMPORTANT_STRUCTURES */];
            const returnObject = {
                controller: this.getControllerInfo(roomName),
                portals: this.getPortalInfo(roomName),
                sources: _.map(savedSources, src => src.cn ? { pos: unpackCoordAsPos(src.c, roomName), containerPos: unpackCoordAsPos(src.cn, roomName) }
                    : { pos: unpackCoordAsPos(src.c, roomName) }),
                mineral: savedMineral ? {
                    pos: unpackCoordAsPos(savedMineral.c, roomName),
                    mineralType: savedMineral["t" /* RMEM_MNRL.MINERALTYPE */],
                    density: savedMineral["d" /* RMEM_MNRL.DENSITY */],
                } : undefined,
                skLairs: _.map(savedSkLairs, lair => ({ pos: unpackCoordAsPos(lair.c, roomName) })),
                importantStructures: this.getImportantStructureInfo(roomName)
            };
            return returnObject;
        }
    }
    /**
     * Records all info for permanent room objects, e.g. sources, controllers, etc.
     */
    static recordPermanentObjects(room) {
        room.memory["T" /* MEM.TICK */] = Game.time;
        if (room.sources.length > 0) {
            room.memory["s" /* RMEM.SOURCES */] = _.map(room.sources, source => {
                const coord = packCoord(source.pos);
                const container = source.pos.findClosestByLimitedRange(room.containers, 2);
                return container ? { c: coord, cn: packCoord(container.pos) } : { c: coord };
            });
        }
        else {
            delete room.memory["s" /* RMEM.SOURCES */];
        }
        if (room.controller) {
            room.memory["c" /* RMEM.CONTROLLER */] = {
                c: packCoord(room.controller.pos),
                ["l" /* RMEM_CTRL.LEVEL */]: room.controller.level,
                ["o" /* RMEM_CTRL.OWNER */]: room.controller.owner ? room.controller.owner.username : undefined,
                ["r" /* RMEM_CTRL.RESERVATION */]: room.controller.reservation ?
                    {
                        ["u" /* RMEM_CTRL.RES_USERNAME */]: room.controller.reservation.username,
                        ["t" /* RMEM_CTRL.RES_TICKSTOEND */]: room.controller.reservation.ticksToEnd,
                    } : undefined,
                ["s" /* RMEM_CTRL.SAFEMODE */]: room.controller.safeMode,
                ["sa" /* RMEM_CTRL.SAFEMODE_AVAILABLE */]: room.controller.safeModeAvailable,
                ["sc" /* RMEM_CTRL.SAFEMODE_COOLDOWN */]: room.controller.safeModeCooldown,
                ["p" /* RMEM_CTRL.PROGRESS */]: room.controller.progress,
                ["pt" /* RMEM_CTRL.PROGRESS_TOTAL */]: room.controller.progressTotal
            };
        }
        else {
            delete room.memory["c" /* RMEM.CONTROLLER */];
        }
        if (room.mineral) {
            room.memory["m" /* RMEM.MINERAL */] = {
                c: packCoord(room.mineral.pos),
                ["d" /* RMEM_MNRL.DENSITY */]: room.mineral.density,
                ["t" /* RMEM_MNRL.MINERALTYPE */]: room.mineral.mineralType
            };
        }
        else {
            delete room.memory["m" /* RMEM.MINERAL */];
        }
        if (room.keeperLairs.length > 0) {
            room.memory["k" /* RMEM.SKLAIRS */] = _.map(room.keeperLairs, lair => {
                // Keeper logic is to just move to the first _.find([...sources, mineral], range <=5); see
                // https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/keepers/pretick.js
                const keeperTarget = _.find(_.compact([...room.sources, room.mineral]), thing => thing.pos.getRangeTo(lair.pos) <= 5);
                let chillPos;
                if (keeperTarget) { // should always be true
                    chillPos = lair.pos.findClosestByPath(keeperTarget.pos.neighbors) || undefined;
                }
                return chillPos ? { c: packCoord(lair.pos), cp: packCoord(chillPos) } : { c: packCoord(lair.pos) };
            });
        }
        else {
            delete room.memory["k" /* RMEM.SKLAIRS */];
        }
        this.recordOwnedRoomStructures(room);
        this.recordPortalInfo(room);
    }
    static recordOwnedRoomStructures(room) {
        if (room.controller && room.controller.owner) {
            room.memory["i" /* RMEM.IMPORTANT_STRUCTURES */] = {
                ["t" /* RMEM_STRUCTS.TOWERS */]: packCoordList(_.map(room.towers, t => t.pos)),
                ["sp" /* RMEM_STRUCTS.SPAWNS */]: packCoordList(_.map(room.spawns, s => s.pos)),
                ["w" /* RMEM_STRUCTS.WALLS */]: packCoordList(_.map(room.walls, w => w.pos)),
                ["r" /* RMEM_STRUCTS.RAMPARTS */]: packCoordList(_.map(room.ramparts, r => r.pos)),
                ["s" /* RMEM_STRUCTS.STORAGE */]: room.storage ? packCoord(room.storage.pos) : undefined,
                ["e" /* RMEM_STRUCTS.TERMINAL */]: room.terminal ? packCoord(room.terminal.pos) : undefined,
            };
        }
        else {
            delete room.memory["i" /* RMEM.IMPORTANT_STRUCTURES */];
        }
    }
    static recordPortalInfo(room) {
        if (room.portals.length > 0) {
            room.memory["pr" /* RMEM.PORTALS */] = _.map(room.portals, portal => {
                const dest = portal.destination instanceof RoomPosition ? packPos(portal.destination)
                    : portal.destination;
                const expiration = portal.ticksToDecay != undefined ? Game.time + portal.ticksToDecay
                    : Game.time + 1000000;
                return { c: packCoord(portal.pos), dest: dest, ["X" /* MEM.EXPIRATION */]: expiration };
            });
            const uniquePortals = _.unique(room.portals, portal => portal.destination instanceof RoomPosition ? packPos(portal.destination)
                : portal.destination);
            if (!this.memory.portalRooms.includes(room.name)) {
                this.memory.portalRooms.push(room.name);
            }
        }
        else {
            delete room.memory["pr" /* RMEM.PORTALS */];
            _.pull(this.memory.portalRooms, room.name);
        }
    }
    /**
     * Update time-sensitive reservation and safemode info
     */
    static recordControllerInfo(controller) {
        const savedController = controller.room.memory["c" /* RMEM.CONTROLLER */];
        if (savedController) {
            savedController["r" /* RMEM_CTRL.RESERVATION */] = controller.reservation ? {
                ["u" /* RMEM_CTRL.RES_USERNAME */]: controller.reservation.username,
                ["t" /* RMEM_CTRL.RES_TICKSTOEND */]: controller.reservation.ticksToEnd,
            } : undefined;
            savedController["s" /* RMEM_CTRL.SAFEMODE */] = controller.safeMode;
            savedController["sc" /* RMEM_CTRL.SAFEMODE_COOLDOWN */] = controller.safeModeCooldown;
        }
    }
    static inSafeMode(roomName) {
        if (!!Memory.rooms[roomName] && !!Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]) {
            const safemode = Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["s" /* RMEM_CTRL.SAFEMODE */];
            const tick = Memory.rooms[roomName]["X" /* MEM.EXPIRATION */];
            if (safemode && tick) {
                return Game.time < tick + safemode;
            }
        }
        return false;
    }
    static safeModeCooldown(roomName) {
        if (Memory.rooms[roomName] && Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */] &&
            Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["sc" /* RMEM_CTRL.SAFEMODE_COOLDOWN */]) {
            const smcooldown = Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["sc" /* RMEM_CTRL.SAFEMODE_COOLDOWN */];
            const tick = Memory.rooms[roomName]["X" /* MEM.EXPIRATION */];
            if (smcooldown && tick) {
                return smcooldown - (Game.time - tick);
            }
        }
    }
    static recomputeScoreIfNecessary(room) {
        if (room.memory["e" /* RMEM.EXPANSION_DATA */] === 0) { // room is uninhabitable or owned
            if (Math.random() < FALSE_SCORE_RECALC_PROB) {
                // false scores get evaluated very occasionally
                return ExpansionEvaluator.computeExpansionData(room);
            }
        }
        else { // if the room is not uninhabitable
            if (!room.memory["e" /* RMEM.EXPANSION_DATA */] || Math.random() < SCORE_RECALC_PROB) {
                // recompute some of the time
                return ExpansionEvaluator.computeExpansionData(room);
            }
        }
        return false;
    }
    static updateInvasionData(room) {
        if (!room.memory["v" /* RMEM.INVASION_DATA */]) {
            room.memory["v" /* RMEM.INVASION_DATA */] = {
                ["h" /* RMEM_INVASION.HARVESTED */]: 0,
                ["l" /* RMEM_INVASION.LAST_SEEN */]: 0,
            };
        }
        const sources = room.sources;
        const invasionData = room.memory["v" /* RMEM.INVASION_DATA */];
        for (const source of sources) {
            if (source.ticksToRegeneration == 1) {
                invasionData["h" /* RMEM_INVASION.HARVESTED */] += source.energyCapacity - source.energy;
            }
        }
        if (room.invaders.length > 0) {
            invasionData["h" /* RMEM_INVASION.HARVESTED */] = 0;
            invasionData["l" /* RMEM_INVASION.LAST_SEEN */] = Game.time;
        }
    }
    // private static updateHarvestData(room: Room): void {
    // 	if (!room.memory[RMEM.HARVEST]) {
    // 		room.memory[RMEM.HARVEST] = {
    // 			[MEM_AVGS.AMOUNT] : 0,
    // 			[MEM_AVGS.AVG10K] : _.sum(room.sources, s => s.energyCapacity / ENERGY_REGEN_TIME),
    // 			[MEM_AVGS.AVG100K]: _.sum(room.sources, s => s.energyCapacity / ENERGY_REGEN_TIME),
    // 			[MEM_AVGS.AVG1M]  : _.sum(room.sources, s => s.energyCapacity / ENERGY_REGEN_TIME),
    // 			[MEM.TICK]             : Game.time,
    // 		};
    // 	}
    // 	const harvest = room.memory[RMEM.HARVEST] as RollingStats;
    // 	for (const source of room.sources) {
    // 		if (source.ticksToRegeneration == 1) {
    // 			const dEnergy = source.energyCapacity - source.energy;
    // 			const dTime = Game.time - harvest[MEM.TICK] + 1; // +1 to avoid division by zero errors
    // 			harvest[MEM_AVGS.AMOUNT] += dEnergy;
    // 			harvest[MEM_AVGS.AVG10K] = +(irregularExponentialMovingAverage(
    // 				dEnergy / dTime, harvest[MEM_AVGS.AVG10K], dTime, 10000)).toFixed(7);
    // 			harvest[MEM_AVGS.AVG100K] = +(irregularExponentialMovingAverage(
    // 				dEnergy / dTime, harvest[MEM_AVGS.AVG100K], dTime, 100000)).toFixed(7);
    // 			harvest[MEM_AVGS.AVG1M] = +(irregularExponentialMovingAverage(
    // 				dEnergy / dTime, harvest[MEM_AVGS.AVG1M], dTime, 1000000)).toFixed(7);
    // 			harvest[MEM.TICK] = Game.time;
    // 		}
    // 	}
    // }
    // private static updateCasualtyData(room: Room): void {
    // 	if (!room.memory[RMEM.CASUALTIES]) {
    // 		room.memory[RMEM.CASUALTIES] = {
    // 			cost: {
    // 				[MEM_AVGS.AMOUNT] : 0,
    // 				[MEM_AVGS.AVG10K] : 0,
    // 				[MEM_AVGS.AVG100K]: 0,
    // 				[MEM_AVGS.AVG1M]  : 0,
    // 				[MEM.TICK]             : Game.time,
    // 			}
    // 		};
    // 	}
    // 	const casualtiesCost = room.memory[RMEM.CASUALTIES]!.cost as RollingStats;
    // 	for (const tombstone of room.tombstones) {
    // 		if (tombstone.ticksToDecay == 1) {
    // 			// record any casualties, which are my creeps which died prematurely
    // 			if ((tombstone.creep.ticksToLive || 0) > 1 && tombstone.creep.owner.username == MY_USERNAME
    // 				&& isCreep(tombstone.creep)) {
    // 				const body = _.map(tombstone.creep.body, part => part.type);
    // 				const lifetime = body.includes(CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
    // 				const dCost = bodyCost(body) * (tombstone.creep.ticksToLive || 0) / lifetime;
    // 				const dTime = Game.time - casualtiesCost[MEM.TICK] + 1;
    // 				casualtiesCost[MEM_AVGS.AMOUNT] += dCost;
    // 				casualtiesCost[MEM_AVGS.AVG10K] = +(irregularExponentialMovingAverage(
    // 					dCost / dTime, casualtiesCost[MEM_AVGS.AVG10K], dTime, 10000)).toFixed(7);
    // 				casualtiesCost[MEM_AVGS.AVG100K] = +(irregularExponentialMovingAverage(
    // 					dCost / dTime, casualtiesCost[MEM_AVGS.AVG100K], dTime, 100000)).toFixed(7);
    // 				casualtiesCost[MEM_AVGS.AVG1M] = +(irregularExponentialMovingAverage(
    // 					dCost / dTime, casualtiesCost[MEM_AVGS.AVG1M], dTime, 1000000)).toFixed(7);
    // 				casualtiesCost[MEM.TICK] = Game.time;
    // 			}
    // 		}
    // 	}
    // }
    static getExitPositions(roomName) {
        const terrain = Game.map.getRoomTerrain(roomName);
        const exitPositions = [];
        for (let x = 0; x < 50; x += 49) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) != TERRAIN_MASK_WALL) {
                    exitPositions.push(new RoomPosition(x, y, roomName));
                }
            }
        }
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y += 49) {
                if (terrain.get(x, y) != TERRAIN_MASK_WALL) {
                    exitPositions.push(new RoomPosition(x, y, roomName));
                }
            }
        }
        return exitPositions;
    }
    /**
     * Get the pos a creep was in on the previous tick, returning the same position as the creep if no data was
     * gathered on the previous tick.
     */
    static getPreviousPos(creep) {
        const prevPositions = creep.room.memory["pp" /* RMEM.PREV_POSITIONS */];
        if (prevPositions) {
            const packedId = packId(creep.id);
            if (prevPositions[packedId]) {
                return unpackCoordAsPos(prevPositions[packedId], creep.room.name);
            }
        }
        return creep.pos; // no data
    }
    static recordCreepPositions(room) {
        const positions = {};
        for (const creep of room.find(FIND_CREEPS)) {
            positions[packId(creep.id)] = packCoord(creep.pos);
        }
        room.memory["pp" /* RMEM.PREV_POSITIONS */] = {};
    }
    // private static recordCreepOccupancies(room: Room): void {
    // 	if (!room.memory[RMEM.CREEPS_IN_ROOM]) {
    // 		room.memory[RMEM.CREEPS_IN_ROOM] = {};
    // 	}
    // 	const creepsInRoom = room.memory[RMEM.CREEPS_IN_ROOM]!;
    // 	for (const tick in creepsInRoom) {
    // 		if (parseInt(tick, 10) < Game.time - ROOM_CREEP_HISTORY_TICKS) {
    // 			delete creepsInRoom[tick];
    // 		}
    // 	}
    // 	creepsInRoom[Game.time] = _.map(room.hostiles, creep => creep.name);
    // }
    /**
     * Records threat levels, visibility, consecutive safe/unsafe ticks and other data on visible or invisible rooms.
     * Must be run in RoomIntel.init(), as it populates several room properties used elsewhere // TODO: expensive
     */
    static recordSafety(roomName) {
        // Make sure the memory objects are there
        Memory.rooms[roomName] = Memory.rooms[roomName] || {};
        Memory.rooms[roomName]["f" /* RMEM.SAFETY */] = Memory.rooms[roomName]["f" /* RMEM.SAFETY */] || {
            ["t" /* RMEM_SAFETY.THREAT_LEVEL */]: 0,
            ["s" /* RMEM_SAFETY.SAFE_FOR */]: 0,
            ["u" /* RMEM_SAFETY.UNSAFE_FOR */]: 0,
            ["v" /* RMEM_SAFETY.INVISIBLE_FOR */]: 0,
        };
        const safetyData = Memory.rooms[roomName]["f" /* RMEM.SAFETY */];
        const room = Game.rooms[roomName];
        if (room) {
            safetyData["v" /* RMEM_SAFETY.INVISIBLE_FOR */] = 0;
            if (room.dangerousHostiles.length > 0) {
                safetyData["s" /* RMEM_SAFETY.SAFE_FOR */] = 0;
                safetyData["u" /* RMEM_SAFETY.UNSAFE_FOR */] += 1;
            }
            else {
                safetyData["s" /* RMEM_SAFETY.SAFE_FOR */] += 1;
                safetyData["u" /* RMEM_SAFETY.UNSAFE_FOR */] = 0;
            }
            if (room.my || room.isOutpost) {
                // Record combat potentials of creeps in room
                const potentials = CombatIntel.getCombatPotentials(room.dangerousPlayerHostiles);
                safetyData["c" /* RMEM_SAFETY.COMBAT_POTENTIALS */] = {
                    ["a" /* COMBAT_POTENTIALS.ATTACK */]: potentials.attack,
                    ["r" /* COMBAT_POTENTIALS.RANGED */]: potentials.ranged,
                    ["h" /* COMBAT_POTENTIALS.HEAL */]: potentials.heal,
                };
                if (potentials.dismantle) {
                    safetyData["c" /* RMEM_SAFETY.COMBAT_POTENTIALS */]["d" /* COMBAT_POTENTIALS.DISMANTLE */] = potentials.dismantle;
                }
                // Record hostile counts
                safetyData["nh" /* RMEM_SAFETY.NUM_HOSTILES */] = room.hostiles.length; // this records ALL hostiles!
                safetyData["nb" /* RMEM_SAFETY.NUM_BOOSTED_HOSTILES */] = _.filter(room.hostiles, hostile => hostile.boosts.length > 0).length;
            }
            else {
                delete safetyData["c" /* RMEM_SAFETY.COMBAT_POTENTIALS */];
                delete safetyData["nh" /* RMEM_SAFETY.NUM_HOSTILES */];
                delete safetyData["nb" /* RMEM_SAFETY.NUM_BOOSTED_HOSTILES */];
            }
        }
        else {
            safetyData["v" /* RMEM_SAFETY.INVISIBLE_FOR */] += 1;
        }
        // Instantaneous threat level for a room scales from 0 to 1, with presence from non-player hostiles capped at
        // a threat levle of 0.5.
        let instantaneousThreatLevel;
        if (!room) {
            instantaneousThreatLevel = 0.5;
        }
        else {
            if (room.controller && room.controller.safeMode) {
                instantaneousThreatLevel = 0;
            }
            else {
                if (room.dangerousPlayerHostiles.length > 0) {
                    instantaneousThreatLevel = 1;
                }
                else if (room.dangerousHostiles.length > 0) {
                    instantaneousThreatLevel = 0.5;
                }
                else {
                    instantaneousThreatLevel = 0;
                }
            }
        }
        // Average it over time, using different averaging windows depending on the scenario
        const numBoostedHostiles = safetyData["nb" /* RMEM_SAFETY.NUM_BOOSTED_HOSTILES */] || 0;
        switch (instantaneousThreatLevel) {
            case 0:
                safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */] = ema(instantaneousThreatLevel, safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */], CREEP_LIFE_TIME / 2);
                break;
            case 0.5:
                safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */] = ema(instantaneousThreatLevel, safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */], CREEP_LIFE_TIME / (1 + numBoostedHostiles));
                break;
            case 1:
                safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */] = ema(instantaneousThreatLevel, safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */], CREEP_LIFE_TIME / (4 + numBoostedHostiles));
                break;
        }
        // // Compute rolling averages
        // const dTime = Game.time - safetyData[RMEM_SAFETY.TICK];
        // safetyData[RMEM_SAFETY.SAFETY_1K] = +(irregularEma(
        // 	safety, safetyData[RMEM_SAFETY.SAFETY_1K], dTime, 1000)).toFixed(5);
        // safetyData[RMEM_SAFETY.SAFETY_10K] = +(irregularEma(
        // 	safety, safetyData[RMEM_SAFETY.SAFETY_10K], dTime, 10000)).toFixed(5);
        // Populate the per-tick properties on the room object itself
        if (room) {
            room.instantaneousThreatLevel = instantaneousThreatLevel;
            room.threatLevel = safetyData["t" /* RMEM_SAFETY.THREAT_LEVEL */];
            room.isSafe = room.instantaneousThreatLevel == 0 &&
                (room.threatLevel < 0.15 || safetyData["s" /* RMEM_SAFETY.SAFE_FOR */] > 50);
        }
    }
    static getSafetyData(roomName) {
        const data = Memory.rooms[roomName]["f" /* RMEM.SAFETY */];
        return {
            threatLevel: data["t" /* RMEM_SAFETY.THREAT_LEVEL */],
            safeFor: data["s" /* RMEM_SAFETY.SAFE_FOR */],
            unsafeFor: data["u" /* RMEM_SAFETY.UNSAFE_FOR */],
            invisibleFor: data["v" /* RMEM_SAFETY.INVISIBLE_FOR */],
            combatPotentials: data["c" /* RMEM_SAFETY.COMBAT_POTENTIALS */],
            numHostiles: data["nh" /* RMEM_SAFETY.NUM_HOSTILES */],
            numBoostedHostiles: data["nb" /* RMEM_SAFETY.NUM_BOOSTED_HOSTILES */],
        };
    }
    static isInvasionLikely(room) {
        const data = room.memory["v" /* RMEM.INVASION_DATA */];
        if (!data)
            return false;
        const harvested = data["h" /* RMEM_INVASION.HARVESTED */];
        const lastSeen = data["l" /* RMEM_INVASION.LAST_SEEN */];
        if (lastSeen > 20000) { // maybe room is surrounded by owned/reserved rooms and invasions aren't possible
            return false;
        }
        switch (room.sources.length) {
            case 1:
                return harvested > 90000;
            case 2:
                return harvested > 75000;
            case 3:
                return harvested > 65000;
            default: // shouldn't ever get here
                return false;
        }
    }
    static roomOwnedBy(roomName) {
        if (Memory.rooms[roomName] && Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */] &&
            Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["o" /* RMEM_CTRL.OWNER */]) {
            if (Game.time - (Memory.rooms[roomName]["T" /* MEM.TICK */] || 0) < 25000) { // ownership expires after 25k ticks
                return Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["o" /* RMEM_CTRL.OWNER */];
            }
        }
    }
    static roomReservedBy(roomName) {
        if (Memory.rooms[roomName] && Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */] &&
            Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["r" /* RMEM_CTRL.RESERVATION */]) {
            if (Game.time - (Memory.rooms[roomName]["T" /* MEM.TICK */] || 0) < 10000) { // reservation expires after 10k ticks
                return Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["r" /* RMEM_CTRL.RESERVATION */]["u" /* RMEM_CTRL.RES_USERNAME */];
            }
        }
    }
    static roomReservationRemaining(roomName) {
        if (Memory.rooms[roomName] && Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */] &&
            Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["r" /* RMEM_CTRL.RESERVATION */]) {
            const ticksToEnd = Memory.rooms[roomName]["c" /* RMEM.CONTROLLER */]["r" /* RMEM_CTRL.RESERVATION */]["t" /* RMEM_CTRL.RES_TICKSTOEND */];
            const timeSinceLastSeen = Game.time - (Memory.rooms[roomName]["T" /* MEM.TICK */] || 0);
            return ticksToEnd - timeSinceLastSeen;
        }
        return 0;
    }
    /**
     * Returns the portals that are within a specified range of a colony indexed by their room
     */
    static findPortalsInRange(roomName, range, includeIntershard = false) {
        const potentialPortalRooms = Cartographer.findRoomsInRange(roomName, range)
            .filter(roomName => Cartographer.roomType(roomName) == ROOMTYPE_CORE);
        // Examine for portals
        const portalRooms = potentialPortalRooms.filter(roomName => Memory.rooms[roomName]
            && !!Memory.rooms[roomName]["pr" /* RMEM.PORTALS */]);
        const rooms = {};
        for (const roomName of portalRooms) {
            const roomPortals = Memory.rooms[roomName]["pr" /* RMEM.PORTALS */]; // to prevent TS errors
            if (roomPortals != undefined && roomPortals.length > 0) {
                rooms[roomName] = roomPortals;
            }
        }
        return rooms;
    }
    // static requestZoneData() {
    // 	const checkOnTick = 123;
    // 	if (Game.time % 1000 == checkOnTick - 2) {
    // 		Segmenter.requestForeignSegment('LeagueOfAutomatedNations', 96);
    // 	} else if (Game.time % 1000 == checkOnTick - 1) {
    // 		const loanData = Segmenter.getForeignSegment();
    // 		if (loanData) {
    // 			Memory.zoneRooms = loanData;
    // 		} else {
    // 			log.error('Empty LOAN data');
    // 		}
    // 	}
    // }
    /**
     * Cached version of Game.map.getRoomStatus() which retrieves compressed status data and converts to RoomStatus
     */
    static getRoomStatus(roomName) {
        Memory.rooms[roomName] = Memory.rooms[roomName] || {};
        // Recalculate if you haven't seen this room before or if the timestamp is expired
        if (!Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */] ||
            new Date().getTime() > new Date(Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */][1] * 1000).getTime()) {
            let { status, timestamp } = Game.map.getRoomStatus(roomName);
            if (timestamp == null) { // null timestamp means indefinite, but not really; let's recheck in a few days
                const extraMilliseconds = 3 * 24 * 60 * 60 * 1000; // check again in 3 days
                timestamp = new Date().getTime() + extraMilliseconds;
            }
            timestamp = Math.floor(timestamp / 1000); // don't need milliseconds; seconds will do
            switch (status) {
                case 'normal':
                    Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */] = ["nm" /* RMEM_ROOM_STATUS.normal */, timestamp];
                    break;
                case 'closed':
                    Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */] = ["cl" /* RMEM_ROOM_STATUS.closed */, timestamp];
                    break;
                case 'novice':
                    Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */] = ["nv" /* RMEM_ROOM_STATUS.novice */, timestamp];
                    break;
                case 'respawn':
                    Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */] = ["re" /* RMEM_ROOM_STATUS.respawn */, timestamp];
                    break;
            }
        }
        const [statusCompressed, timestampCompressed] = Memory.rooms[roomName]["rs" /* RMEM.ROOM_STATUS */];
        const timestamp = timestampCompressed * 1000;
        switch (statusCompressed) {
            case "nm" /* RMEM_ROOM_STATUS.normal */:
                return { status: 'normal', timestamp: null };
            case "cl" /* RMEM_ROOM_STATUS.closed */:
                return { status: 'closed', timestamp: null };
            case "nv" /* RMEM_ROOM_STATUS.novice */:
                return { status: 'novice', timestamp: timestamp };
            case "re" /* RMEM_ROOM_STATUS.respawn */:
                return { status: 'respawn', timestamp: timestamp };
        }
    }
    /**
     * Mimics the functionality of Game.map.isRoomAvailable(), but returns false if the room is in a different
     * type of zone than you are in, such as if you are in a novice zone and the room is outside of it.
     */
    static isRoomAccessible(roomName) {
        return RoomIntel_1.getRoomStatus(roomName).status == RoomIntel_1.getMyZoneStatus();
    }
    /**
     * Returns the type of zone that your empire is in
     */
    static getMyZoneStatus() {
        const oneOfMyColonies = _.first(_.values(Overmind.colonies));
        return RoomIntel_1.getRoomStatus(oneOfMyColonies.name).status;
    }
    /**
     * RoomIntel.init() is the very first thing that is run in the init phase of each tick. The only stuff that should
     * go in here is critical and inexpensive stuff that is necessary information for this tick.
     */
    static init() {
        for (const roomName in Game.rooms) {
            Memory.rooms[roomName] = Memory.rooms[roomName] || {};
        }
        for (const roomName in Memory.rooms) {
            const room = Game.rooms[roomName];
            this.recordSafety(roomName);
            if (room) {
                this.markVisible(room);
            }
        }
    }
    /**
     * RoomIntel.run() is the very last thing that is run in the run phase of each tick. If something times out earlier
     * in the script, then this will not be fully executed, so do not put critical stuff here.
     */
    static run() {
        let alreadyComputedScore = false;
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            // Track invasion data, harvesting, and casualties for all colony rooms and outposts
            if (Overmind.colonyMap[room.name]) { // if it is an owned or outpost room
                this.updateInvasionData(room);
                // this.updateHarvestData(room);
                // this.updateCasualtyData(room);
            }
            // Record previous creep positions (RoomIntel.run() is executed at end of each tick)
            this.recordCreepPositions(room);
            // if (room.my) {
            // 	this.recordCreepOccupancies(room);
            // }
            // Record location of permanent objects in room and recompute score as needed
            if (Game.time >= (room.memory["X" /* MEM.EXPIRATION */] || 0)) {
                this.recordPermanentObjects(room);
                if (!alreadyComputedScore) {
                    alreadyComputedScore = this.recomputeScoreIfNecessary(room);
                }
                // Refresh cache
                const recacheTime = room.owner ? OWNED_RECACHE_TIME : RECACHE_TIME;
                room.memory["X" /* MEM.EXPIRATION */] = getCacheExpiration(recacheTime, 250);
            }
            if (room.controller && Game.time % 5 == 0) {
                this.recordControllerInfo(room.controller);
            }
        }
        if (Game.time % 20 == 0) {
            this.cleanMemory();
        }
    }
};
RoomIntel = RoomIntel_1 = __decorate([
    profile
], RoomIntel);
export { RoomIntel };
// For debugging purposes
global.RoomIntel = RoomIntel;
