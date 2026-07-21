var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { getAllColonies } from '../Colony';
import { log } from '../console/log';
import { DEFAULT_MAX_PATH_LENGTH } from '../directives/Directive';
import { Mem } from '../memory/Memory';
import { Pathing } from '../movement/Pathing';
import { profile } from '../profiler/decorator';
import { getCacheExpiration, minBy, onPublicServer } from '../utilities/utils';
const getDefaultSpawnGroupMemory = () => ({
    colonies: [],
    distances: {},
    // routes    : {},
    // paths    : {},
    expiration: 0,
});
const MAX_LINEAR_DISTANCE = 10; // maximum linear distance to search for ANY spawn group
const DEFAULT_RECACHE_TIME = onPublicServer() ? 2000 : 1000;
const defaultSettings = {
    maxPathDistance: 4 * 50, // override default path distance
    requiredRCL: 7,
    maxLevelDifference: 0,
    // flexibleEnergy    : true,
};
/**
 * SpawnGroup provides a decentralized method of spawning creeps from multiple nearby colonies. Use cases include
 * incubation, spawning large combat groups, etc.
 */
let SpawnGroup = class SpawnGroup {
    constructor(initializer, settings = {}) {
        this.roomName = initializer.pos.roomName;
        // this.room = initializer.room;
        if (!Memory.rooms[this.roomName]) {
            Memory.rooms[this.roomName] = {};
        }
        this.memory = Mem.wrap(Memory.rooms[this.roomName], 'spawnGroup', getDefaultSpawnGroupMemory);
        this.ref = initializer.ref + ':SG';
        this.stats = {
            avgDistance: (_.sum(this.memory.distances) / _.keys(this.memory.distances).length) || 100,
        };
        this.requests = [];
        this.settings = _.defaults(settings, defaultSettings);
        if (Game.time >= this.memory.expiration) {
            this.recalculateColonies();
        }
        // Compute stats
        this.colonyNames = _.filter(this.memory.colonies, roomName => this.memory.distances[roomName] <= this.settings.maxPathDistance &&
            Game.rooms[roomName] && Game.rooms[roomName].my &&
            Game.rooms[roomName].controller.level >= this.settings.requiredRCL);
        if (this.colonyNames.length == 0) {
            log.warning(`No colonies meet the requirements for SpawnGroup: ${this.ref}`);
        }
        this.energyCapacityAvailable = _.max(_.map(this.colonyNames, roomName => Game.rooms[roomName].energyCapacityAvailable));
        this._colonies = undefined;
        Overmind.spawnGroups[this.ref] = this;
    }
    get colonies() {
        if (!this._colonies) {
            this._colonies = _.compact(_.map(this.colonyNames, roomName => Overmind.colonies[roomName]));
        }
        return this._colonies;
    }
    /**
     * Refresh the state of the spawnGroup; called by the Overmind object.
     */
    refresh() {
        this.memory = Mem.wrap(Memory.rooms[this.roomName], 'spawnGroup', getDefaultSpawnGroupMemory);
        this.requests = [];
        this._colonies = undefined;
    }
    recalculateColonies() {
        // Get all colonies in range that are of required level, then filter out ones that are too far from best
        let coloniesInRange = _.filter(getAllColonies(), colony => Game.map.getRoomLinearDistance(colony.room.name, this.roomName) <= MAX_LINEAR_DISTANCE);
        const maxColonyLevel = _.max(_.map(coloniesInRange, colony => colony.level));
        coloniesInRange = _.filter(coloniesInRange, colony => maxColonyLevel - colony.level <= this.settings.maxLevelDifference);
        const colonyNames = [];
        // const routes = {} as { [colonyName: string]: { [roomName: string]: boolean } };
        // let paths = {} as { [colonyName: string]: { startPos: RoomPosition, path: string[] } };
        const distances = {};
        for (const colony of coloniesInRange) {
            const spawn = colony.room.spawns[0];
            if (spawn) {
                // const route = Pathing.findRoute(colony.room.name, this.roomName);
                const path = Pathing.findPathToRoom(spawn.pos, this.roomName);
                if (!path.incomplete && path.path.length <= DEFAULT_MAX_PATH_LENGTH + 25) {
                    colonyNames.push(colony.room.name);
                    // routes[colony.room.name] = route;
                    // paths[room.name] = path.path;
                    distances[colony.room.name] = path.path.length;
                }
            }
        }
        this.memory.colonies = colonyNames;
        // this.memory.routes = routes;
        // this.memory.paths = TODO
        this.memory.distances = distances;
        this.memory.expiration = getCacheExpiration(DEFAULT_RECACHE_TIME, 25);
    }
    enqueue(request) {
        this.requests.push(request);
    }
    /**
     * SpawnGroup.init() must be called AFTER all hatcheries have been initialized
     */
    init() {
        // Most initialization needs to be done at init phase because colonies are still being constructed earlier
        const colonies = _.compact(_.map(this.colonyNames, name => Overmind.colonies[name]));
        const hatcheries = _.compact(_.map(colonies, colony => colony.hatchery));
        const distanceTo = (hatchery) => this.memory.distances[hatchery.pos.roomName] + 25;
        // Enqueue each requests to the hatchery with least expected wait time, which is updated after each enqueue
        for (const request of this.requests) {
            // const maxCost = bodyCost(request.setup.generateBody(this.energyCapacityAvailable));
            // const okHatcheries = _.filter(hatcheries,
            // 							  hatchery => hatchery.room.energyCapacityAvailable >= maxCost);
            const bestHatchery = minBy(hatcheries, hatchery => hatchery.getWaitTimeForPriority(request.priority) +
                distanceTo(hatchery));
            if (bestHatchery) {
                bestHatchery.enqueue(request);
            }
            else {
                log.error(`Could not enqueue creep with role ${request.setup.role} in ${this.roomName} ` +
                    `for Overlord ${request.overlord.print}!`);
            }
        }
    }
    run() {
        // Nothing goes here
    }
};
SpawnGroup = __decorate([
    profile
], SpawnGroup);
export { SpawnGroup };
