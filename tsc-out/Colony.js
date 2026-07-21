var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { assimilationLocked } from './assimilation/decorator';
import { $ } from './caching/GlobalCache';
import { log } from './console/log';
import { Roles } from './creepSetups/setups';
import { CommandCenter } from './hiveClusters/commandCenter';
import { EvolutionChamber } from './hiveClusters/evolutionChamber';
import { Hatchery } from './hiveClusters/hatchery';
// import {PraiseSite} from './hiveClusters/praiseSite';
import { SporeCrawler } from './hiveClusters/sporeCrawler';
import { UpgradeSite } from './hiveClusters/upgradeSite';
import { CombatIntel } from './intel/CombatIntel';
import { Energetics } from './logistics/Energetics';
import { LinkNetwork } from './logistics/LinkNetwork';
import { LogisticsNetwork } from './logistics/LogisticsNetwork';
import { RoadLogistics } from './logistics/RoadLogistics';
import { TransportRequestGroup } from './logistics/TransportRequestGroup';
import { Mem } from './memory/Memory';
import { DefaultOverlord } from './overlords/core/default';
import { TransportOverlord } from './overlords/core/transporter';
import { WorkerOverlord } from './overlords/core/worker';
import { RandomWalkerScoutOverlord } from './overlords/scouting/randomWalker';
import { profile } from './profiler/decorator';
import { ALL_ZERO_ASSETS } from './resources/map_resources';
import { bunkerLayout, getPosFromBunkerCoord } from './roomPlanner/layouts/bunker';
import { RoomPlanner } from './roomPlanner/RoomPlanner';
import { LOG_STATS_INTERVAL, Stats } from './stats/stats';
import { EXPANSION_EVALUATION_FREQ, ExpansionEvaluator } from './strategy/ExpansionEvaluator';
import { Cartographer, ROOMTYPE_CONTROLLER } from './utilities/Cartographer';
import { maxBy, mergeSum, minBy } from './utilities/utils';
import { Visualizer } from './visuals/Visualizer';
export var ColonyStage;
(function (ColonyStage) {
    ColonyStage[ColonyStage["Larva"] = 0] = "Larva";
    ColonyStage[ColonyStage["Pupa"] = 1] = "Pupa";
    ColonyStage[ColonyStage["Adult"] = 2] = "Adult";
})(ColonyStage || (ColonyStage = {}));
export var DEFCON;
(function (DEFCON) {
    DEFCON[DEFCON["safe"] = 0] = "safe";
    DEFCON[DEFCON["invasionNPC"] = 1] = "invasionNPC";
    DEFCON[DEFCON["boostedInvasionNPC"] = 2] = "boostedInvasionNPC";
    DEFCON[DEFCON["playerInvasion"] = 2] = "playerInvasion";
    DEFCON[DEFCON["bigPlayerInvasion"] = 3] = "bigPlayerInvasion";
})(DEFCON || (DEFCON = {}));
export function getAllColonies() {
    return _.values(Overmind.colonies);
}
export var OutpostDisableReason;
(function (OutpostDisableReason) {
    OutpostDisableReason["active"] = "active";
    OutpostDisableReason["inactiveCPU"] = "i_cpu";
    OutpostDisableReason["inactiveUpkeep"] = "i_upkeep";
    OutpostDisableReason["inactiveHarassment"] = "i_harassment";
    OutpostDisableReason["inactiveStronghold"] = "i_stronghold";
})(OutpostDisableReason || (OutpostDisableReason = {}));
const getDefaultColonyMemory = () => ({
    defcon: {
        level: DEFCON.safe,
        tick: -Infinity
    },
    expansionData: {
        possibleExpansions: {},
        expiration: 0,
    },
    maxLevel: 0,
    outposts: {},
});
/**
 * Colonies are the highest-level object other than the global Overmind. A colony groups together all rooms, structures,
 * creeps, utilities, etc. which are run from a single owned room.
 */
let Colony = class Colony {
    constructor(id, roomName, outposts) {
        // Primitive colony setup
        this.id = id;
        this.name = roomName;
        this.ref = roomName;
        this.memory = Mem.wrap(Memory.colonies, roomName, getDefaultColonyMemory);
        // Format outpost state memory
        _.forEach(outposts, outpost => {
            if (!this.memory.outposts[outpost]) {
                this.memory.outposts[outpost] = { active: true };
            }
        });
        _.forEach(_.keys(_.clone(this.memory.outposts)), roomName => {
            if (!outposts.includes(roomName)) {
                delete this.memory.outposts[roomName];
            }
        });
        // Register colony globally to allow 'W1N1' and 'w1n1' to refer to Overmind.colonies.W1N1
        global[this.name] = this;
        global[this.name.toLowerCase()] = this;
        // Build the colony
        this.build(roomName, outposts);
    }
    /**
     * Pretty-print the colony name in the console
     */
    get print() {
        return '<a href="#!/room/' + Game.shard.name + '/' + this.room.name + '">[' + this.name + ']</a>';
    }
    /**
     * Pretty-print the colony name right-padded with spaces to fit E**S** in the console
     */
    get printAligned() {
        const msg = '<a href="#!/room/' + Game.shard.name + '/' + this.room.name + '">[' + this.name + ']</a>';
        const extraSpaces = 'E12S34'.length - this.room.name.length;
        return msg + ' '.repeat(extraSpaces);
    }
    toString() {
        return this.print;
    }
    debug(...args) {
        if (this.memory.debug) {
            log.alert(this.print, args);
        }
    }
    /**
     * Builds the colony object
     */
    build(roomName, outposts) {
        // Register rooms
        this.room = Game.rooms[roomName];
        this.roomNames = [roomName].concat(outposts);
        // Register outposts
        this.outposts = _.compact(_.map(outposts, outpost => Game.rooms[outpost]));
        this.rooms = [this.room].concat(this.outposts);
        this.miningSites = {}; // filled in by harvest directives
        this.extractionSites = {}; // filled in by extract directives
        // this.praiseSite = undefined;
        // Register creeps
        this.creeps = Overmind.cache.creepsByColony[this.name] || [];
        this.creepsByRole = _.groupBy(this.creeps, creep => creep.memory.role);
        // Register the rest of the colony components; the order in which these are called is important!
        this.registerRoomObjects_cached(); // Register real colony components
        this.registerOperationalState(); // Set the colony operational state
        this.registerUtilities(); // Register logistics utilities, room planners, and layout info
        this.registerHiveClusters(); // Build the hive clusters
        /* Colony.spawnMoarOverlords() gets called from Overmind.ts, along with Directive.spawnMoarOverlords() */
    }
    /**
     * Refreshes the state of the colony object
     */
    refresh() {
        this.memory = Memory.colonies[this.room.name];
        // Refresh rooms
        this.room = Game.rooms[this.room.name];
        const outpostRoomNames = _.filter(this.roomNames, roomName => this.room.name != roomName);
        this.outposts = _.compact(_.map(outpostRoomNames, outpost => Game.rooms[outpost]));
        this.rooms = [this.room].concat(this.outposts);
        // refresh creeps
        this.creeps = Overmind.cache.creepsByColony[this.name] || [];
        this.creepsByRole = _.groupBy(this.creeps, creep => creep.memory.role);
        // Register the rest of the colony components; the order in which these are called is important!
        this.refreshRoomObjects();
        this.registerOperationalState();
        this.refreshUtilities();
        this.refreshHiveClusters();
    }
    // /**
    //  * This is used at low levels to request for resources to be dropped in a common pile before containers
    //  * and storage are built
    //  */
    // private registerEnergyReqeusts(): void {
    // 	if (this.stage == ColonyStage.Larva) {
    // 		// If there are no containers, request to drop energy at the location that would be the storagePos
    // 		// if there are also construction sites present in the hatchery
    // 		const realStructureSites = _.filter(this.constructionSites,
    // 											c => c.structureType != STRUCTURE_CONTAINER && c.structureType != STRUCTURE_ROAD);
    // 		if (realStructureSites.length > 0) {
    // 			if (this.room.containers.length == 0 && !this.storage) {
    // 				const dropPos = this.roomPlanner.storagePos;
    // 				if (dropPos) {
    //
    // 				}
    // 			}
    // 		} else {
    // 			if (!this.upgradeSite.battery) {
    // 				const dropPos = this.upgradeSite.batteryPos;
    // 				if (dropPos) {
    //
    // 				}
    // 			}
    // 		}
    //
    // 	}
    // }
    /**
     * Registers physical game objects to the colony
     */
    registerRoomObjects() {
        // Create placeholder arrays for remaining properties to be filled in by the Overmind
        this.flags = []; // filled in by directives
        this.destinations = []; // filled in by various hive clusters and directives
        // Register room objects across colony rooms
        this.controller = this.room.controller; // must be controller since colonies are based in owned rooms
        this.spawns = _.sortBy(_.filter(this.room.spawns, spawn => spawn.my && spawn.isActive()), spawn => spawn.ref);
        this.extensions = this.room.extensions;
        this.storage = this.room.storage && this.room.storage.isActive() ? this.room.storage : undefined;
        this.links = this.room.links;
        this.availableLinks = _.clone(this.room.links);
        this.terminal = this.room.terminal && this.room.terminal.isActive() ? this.room.terminal : undefined;
        this.factory = this.room.factory && this.room.factory.isActive() ? this.room.factory : undefined;
        this.towers = this.room.towers;
        this.labs = _.sortBy(_.filter(this.room.labs, lab => lab.my && lab.isActive()), lab => 50 * lab.pos.y + lab.pos.x); // Labs are sorted in reading order of positions
        this.powerSpawn = this.room.powerSpawn;
        this.nuker = this.room.nuker;
        this.observer = this.room.observer;
        this.pos = (this.storage || this.terminal || this.spawns[0] || this.controller).pos;
        // Register physical objects across all rooms in the colony
        this.sources = _.sortBy(_.flatten(_.map(this.rooms, room => room.sources)), source => source.pos.getMultiRoomRangeTo(this.pos));
        this.extractors = _(this.rooms)
            .map(room => room.extractor)
            .compact()
            .filter(extractor => (extractor.my && extractor.room.my)
            || Cartographer.roomType(extractor.room.name) != ROOMTYPE_CONTROLLER)
            .sortBy(extractor => extractor.pos.getMultiRoomRangeTo(this.pos)).value();
        this.constructionSites = _.flatten(_.map(this.rooms, room => room.constructionSites));
        this.tombstones = _.flatten(_.map(this.rooms, room => room.tombstones));
        this.drops = _.merge(_.map(this.rooms, room => room.drops));
        this.repairables = _.flatten(_.map(this.rooms, room => room.repairables));
        this.rechargeables = _.flatten(_.map(this.rooms, room => room.rechargeables));
        // Register assets
        this.assets = this.computeAssets();
    }
    /**
     * Version of Colony.registerRoomObjects with additional caching functionality
     */
    registerRoomObjects_cached() {
        // Create placeholder arrays for remaining properties to be filled in by the Overmind
        this.flags = []; // filled in by directives
        this.destinations = []; // filled in by various hive clusters and directives
        // Register room objects across colony rooms
        this.controller = this.room.controller; // must be controller since colonies are based in owned rooms
        this.extensions = this.room.extensions;
        this.links = this.room.links;
        this.availableLinks = _.clone(this.room.links);
        this.towers = this.room.towers;
        this.powerSpawn = this.room.powerSpawn;
        this.nuker = this.room.nuker;
        this.observer = this.room.observer;
        $.set(this, 'spawns', () => _.sortBy(_.filter(this.room.spawns, spawn => spawn.my && spawn.isActive()), spawn => spawn.ref));
        $.set(this, 'storage', () => this.room.storage && this.room.storage.isActive() ? this.room.storage : undefined);
        $.set(this, 'terminal', () => this.room.terminal && this.room.terminal.isActive() ? this.room.terminal : undefined);
        $.set(this, 'factory', () => this.room.factory && this.room.factory.isActive() ? this.room.factory : undefined);
        $.set(this, 'labs', () => _.sortBy(_.filter(this.room.labs, lab => lab.my && lab.isActive()), lab => 50 * lab.pos.y + lab.pos.x));
        this.pos = (this.storage || this.terminal || this.spawns[0] || this.controller).pos;
        // Register physical objects across all rooms in the colony
        $.set(this, 'sources', () => _.sortBy(_.flatten(_.map(this.rooms, room => room.sources)), source => source.pos.getMultiRoomRangeTo(this.pos)));
        $.set(this, 'extractors', () => _(this.rooms)
            .map(room => room.extractor)
            .compact()
            .filter(e => (e.my && e.room.my)
            || Cartographer.roomType(e.room.name) != ROOMTYPE_CONTROLLER)
            .sortBy(e => e.pos.getMultiRoomRangeTo(this.pos)).value());
        $.set(this, 'repairables', () => _.flatten(_.map(this.rooms, room => room.repairables)));
        $.set(this, 'rechargeables', () => _.flatten(_.map(this.rooms, room => room.rechargeables)));
        $.set(this, 'constructionSites', () => _.flatten(_.map(this.rooms, room => room.constructionSites)), 10);
        $.set(this, 'tombstones', () => _.flatten(_.map(this.rooms, room => room.tombstones)), 5);
        this.drops = _.merge(_.map(this.rooms, room => room.drops));
        // Register assets
        this.assets = this.computeAssets();
    }
    /**
     * Refresh the state of all physical game objects in the colony
     */
    refreshRoomObjects() {
        $.refresh(this, 'controller', 'extensions', 'links', 'towers', 'powerSpawn', 'nuker', 'observer', 'spawns', 'storage', 'terminal', 'factory', 'labs', 'sources', 'extractors', 'constructionSites', 'repairables', 'rechargeables');
        $.set(this, 'constructionSites', () => _.flatten(_.map(this.rooms, room => room.constructionSites)), 10);
        $.set(this, 'tombstones', () => _.flatten(_.map(this.rooms, room => room.tombstones)), 5);
        this.drops = _.merge(_.map(this.rooms, room => room.drops));
        // Re-compute assets
        this.assets = this.computeAssets();
    }
    /**
     * Registers the operational state of the colony, computing things like colony maturity, DEFCON level, etc.
     */
    registerOperationalState() {
        this.level = this.controller.level;
        // Set colony stage
        if (this.storage && this.spawns[0]) { // TODO: remove colony stage
            if (this.controller.level == 8) {
                this.stage = ColonyStage.Adult;
            }
            else {
                this.stage = ColonyStage.Pupa;
            }
        }
        else {
            this.stage = ColonyStage.Larva;
        }
        // Set DEFCON level TODO: finish this
        let defcon = DEFCON.safe;
        const defconDecayTime = 200;
        if (this.room.dangerousHostiles.length > 0 && !this.controller.safeMode) {
            const effectiveHostileCount = _.sum(this.room.dangerousHostiles, hostile => CombatIntel.uniqueBoosts(hostile).length > 0 ? 2 : 1);
            if (effectiveHostileCount >= 3) {
                defcon = DEFCON.boostedInvasionNPC;
            }
            else {
                defcon = DEFCON.invasionNPC;
            }
        }
        if (this.memory.defcon) {
            if (defcon < this.memory.defcon.level) { // decay defcon level over time if defcon less than memory value
                if (this.memory.defcon.tick + defconDecayTime < Game.time) {
                    this.memory.defcon.level = defcon;
                    this.memory.defcon.tick = Game.time;
                }
            }
            else if (defcon > this.memory.defcon.level) { // refresh defcon time if it increases by a level
                this.memory.defcon.level = defcon;
                this.memory.defcon.tick = Game.time;
            }
        }
        else {
            this.memory.defcon = {
                level: defcon,
                tick: Game.time
            };
        }
        this.defcon = this.memory.defcon.level;
        // Set colony state to blank - other directives can modify this
        this.state = {};
        if (Energetics.lowPowerMode(this)) {
            this.state.lowPowerMode = true;
        }
    }
    /**
     * Registers utility classes such as logistics networks
     */
    registerUtilities() {
        // Resource requests
        this.linkNetwork = new LinkNetwork(this);
        this.logisticsNetwork = new LogisticsNetwork(this);
        this.transportRequests = new TransportRequestGroup();
        // Register a room planner
        this.roomPlanner = new RoomPlanner(this);
        if (this.roomPlanner.memory.bunkerData && this.roomPlanner.memory.bunkerData.anchor) {
            this.layout = 'bunker';
            const anchor = derefRoomPosition(this.roomPlanner.memory.bunkerData.anchor);
            // log.debug(JSON.stringify(`anchor for ${this.name}: ${anchor}`));
            const spawnPositions = _.map(bunkerLayout[8].buildings.spawn.pos, c => getPosFromBunkerCoord(c, this));
            // log.debug(JSON.stringify(`spawnPositions for ${this.name}: ${spawnPositions}`));
            const rightSpawnPos = maxBy(spawnPositions, pos => pos.x);
            const topSpawnPos = minBy(spawnPositions, pos => pos.y);
            const coreSpawnPos = anchor.findClosestByRange(spawnPositions);
            // log.debug(JSON.stringify(`spawnPoses: ${rightSpawnPos}, ${topSpawnPos}, ${coreSpawnPos}`));
            this.bunker = {
                anchor: anchor,
                topSpawn: topSpawnPos.lookForStructure(STRUCTURE_SPAWN),
                coreSpawn: coreSpawnPos.lookForStructure(STRUCTURE_SPAWN),
                rightSpawn: rightSpawnPos.lookForStructure(STRUCTURE_SPAWN),
            };
        }
        else {
            this.layout = 'twoPart';
        }
        // Register road network
        this.roadLogistics = new RoadLogistics(this);
        // // "Organism Abathur with you."
        // this.abathur = new Abathur(this);
        // Add colony to TerminalNetwork if applicable
        if (this.terminal) {
            Overmind.terminalNetwork.addColony(this);
        }
    }
    /**
     * Calls utility.refresh() for each registered utility
     */
    refreshUtilities() {
        this.linkNetwork.refresh();
        this.logisticsNetwork.refresh();
        this.transportRequests.refresh();
        this.roomPlanner.refresh();
        if (this.bunker) {
            if (this.bunker.topSpawn) {
                this.bunker.topSpawn = Game.getObjectById(this.bunker.topSpawn.id);
            }
            if (this.bunker.coreSpawn) {
                this.bunker.coreSpawn = Game.getObjectById(this.bunker.coreSpawn.id);
            }
            if (this.bunker.rightSpawn) {
                this.bunker.rightSpawn = Game.getObjectById(this.bunker.rightSpawn.id);
            }
        }
        this.roadLogistics.refresh();
        // this.abathur.refresh();
    }
    /**
     * Builds hive clusters for each structural group in a colony
     */
    registerHiveClusters() {
        this.hiveClusters = [];
        // Instantiate the command center if there is storage in the room - this must be done first!
        if (this.storage) {
            this.commandCenter = new CommandCenter(this, this.storage);
        }
        // Instantiate the hatchery - the incubation directive assignes hatchery to incubator's hatchery if none exists
        if (this.spawns[0]) {
            this.hatchery = new Hatchery(this, this.spawns[0]);
        }
        // Instantiate evolution chamber once there are three labs all in range 2 of each other
        if (this.terminal && _.filter(this.labs, lab => _.all(this.labs, otherLab => lab.pos.inRangeTo(otherLab, 2))).length >= 3) {
            this.evolutionChamber = new EvolutionChamber(this, this.terminal);
        }
        // Instantiate the upgradeSite
        this.upgradeSite = new UpgradeSite(this, this.controller);
        // Instantiate spore crawlers to wrap towers
        if (this.towers[0]) {
            this.sporeCrawler = new SporeCrawler(this, this.towers[0]);
        }
        // Reverse the hive clusters for correct order for init() and run()
        this.hiveClusters.reverse();
    }
    /**
     * Refreshes the state of each hive cluster
     */
    refreshHiveClusters() {
        for (let i = this.hiveClusters.length - 1; i >= 0; i--) {
            this.hiveClusters[i].refresh();
        }
    }
    /**
     * Returns whether a room is part of this colony and is actively being maintained
     */
    isRoomActive(roomName) {
        if (roomName == this.room.name) {
            return true;
        }
        else if (!this.roomNames.includes(roomName)) {
            return false;
        }
        else {
            return this.memory.outposts[roomName] && this.memory.outposts[roomName].active;
        }
    }
    /**
     * Deactivates an outpost and suspends operations in that room
     */
    suspendOutpost(roomName, reason, duration) {
        this.memory.outposts[roomName] = {
            active: false,
            suspendReason: reason,
            ["X" /* MEM.EXPIRATION */]: Game.time + duration
        };
    }
    handleReactivatingOutposts() {
        for (const roomName in this.memory.outposts) {
            const outpostData = this.memory.outposts[roomName];
            if (!outpostData.active && Game.time >= (outpostData["X" /* MEM.EXPIRATION */] || Infinity)) {
                this.memory.outposts[roomName] = { active: true };
            }
        }
    }
    /**
     * Instantiate all overlords for the colony
     */
    spawnMoarOverlords() {
        this.overlords = {
            default: new DefaultOverlord(this),
            work: new WorkerOverlord(this),
            logistics: new TransportOverlord(this),
        };
        if (!this.observer) {
            this.overlords.scout = new RandomWalkerScoutOverlord(this);
        }
        for (const hiveCluster of this.hiveClusters) {
            hiveCluster.spawnMoarOverlords();
        }
    }
    /**
     * Get a list of creeps in the colony which have a specified role name
     */
    getCreepsByRole(roleName) {
        return this.creepsByRole[roleName] || [];
    }
    /**
     * Get a list of zerg in the colony which have a specified role name
     */
    getZergByRole(roleName) {
        return _.map(this.getCreepsByRole(roleName), creep => Overmind.zerg[creep.name]);
    }
    /**
     * Summarizes the total of all resources in colony store structures, labs, and some creeps. Will always return
     * 0 for an asset that it has none of (not undefined)
     */
    computeAssets(verbose = false) {
        // Include storage structures, lab contents, and manager carry
        const assetStructures = _.compact([this.storage, this.terminal, this.factory, ...this.labs]);
        const assetCreeps = [...this.getCreepsByRole(Roles.queen), ...this.getCreepsByRole(Roles.manager)];
        const assetStores = _.map([...assetStructures, ...assetCreeps], thing => thing.store);
        const allAssets = mergeSum([...assetStores, ALL_ZERO_ASSETS]);
        if (verbose)
            log.debug(`${this.room.print} assets: ` + JSON.stringify(allAssets));
        return allAssets;
    }
    /**
     * Initializes the state of the colony each tick
     */
    init() {
        _.forEach(this.hiveClusters, hiveCluster => hiveCluster.init()); // Initialize each hive cluster
        this.roadLogistics.init(); // Initialize the road network
        this.linkNetwork.init(); // Initialize link network
        this.roomPlanner.init(); // Initialize the room planner
        if (Game.time % EXPANSION_EVALUATION_FREQ == 5 * this.id) { // Re-evaluate expansion data if needed
            ExpansionEvaluator.refreshExpansionData(this.memory.expansionData, this.room.name);
        }
    }
    /**
     * Runs the colony, performing state-changing actions each tick
     */
    run() {
        _.forEach(this.hiveClusters, hiveCluster => hiveCluster.run()); // Run each hive cluster
        this.linkNetwork.run(); // Run the link network
        this.roadLogistics.run(); // Run the road network
        this.roomPlanner.run(); // Run the room planner
        this.stats(); // Log stats per tick
    }
    /**
     * Register colony-wide statistics
     */
    stats() {
        if (Game.time % LOG_STATS_INTERVAL == 0) {
            // Log energy and rcl
            Stats.log(`colonies.${this.name}.storage.energy`, this.storage ? this.storage.energy : undefined);
            Stats.log(`colonies.${this.name}.rcl.level`, this.controller.level);
            Stats.log(`colonies.${this.name}.rcl.progress`, this.controller.progress);
            Stats.log(`colonies.${this.name}.rcl.progressTotal`, this.controller.progressTotal);
            // Log average miningSite usage and uptime and estimated colony energy income
            const numSites = _.keys(this.miningSites).length;
            const avgDowntime = _.sum(this.miningSites, site => site.memory["d" /* HARVEST_MEM.DOWNTIME */]) / numSites;
            const avgUsage = _.sum(this.miningSites, site => site.memory["u" /* HARVEST_MEM.USAGE */]) / numSites;
            const energyInPerTick = _.sum(this.miningSites, site => site.overlords.mine.energyPerTick * site.memory["u" /* HARVEST_MEM.USAGE */]);
            Stats.log(`colonies.${this.name}.miningSites.avgDowntime`, avgDowntime);
            Stats.log(`colonies.${this.name}.miningSites.avgUsage`, avgUsage);
            Stats.log(`colonies.${this.name}.miningSites.energyInPerTick`, energyInPerTick);
            Stats.log(`colonies.${this.name}.assets`, this.assets);
            // Log defensive properties
            Stats.log(`colonies.${this.name}.defcon`, this.defcon);
            Stats.log(`colonies.${this.name}.threatLevel`, this.room.threatLevel);
            const avgBarrierHits = _.sum(this.room.barriers, barrier => barrier.hits) / this.room.barriers.length;
            Stats.log(`colonies.${this.name}.avgBarrierHits`, avgBarrierHits);
        }
    }
    drawCreepReport(coord) {
        let { x, y } = coord;
        const roledata = Overmind.overseer.getCreepReport(this);
        const tablePos = new RoomPosition(x, y, this.room.name);
        y = Visualizer.infoBox(`${this.name} Creeps`, roledata, tablePos, 7);
        return { x, y };
    }
    visuals() {
        let x = 1;
        let y = 11.5;
        let coord;
        coord = this.drawCreepReport({ x, y });
        x = coord.x;
        y = coord.y;
        for (const hiveCluster of _.compact([this.hatchery, this.commandCenter, this.evolutionChamber])) {
            coord = hiveCluster.visuals({ x, y });
            x = coord.x;
            y = coord.y;
        }
    }
};
// abathur: Abathur;
Colony.settings = {
    remoteSourcesByLevel: {
        1: 1,
        2: 2,
        3: 3,
        4: 4,
        5: 5,
        6: 6,
        7: 7,
        8: 9,
    },
    maxSourceDistance: 100
};
Colony = __decorate([
    profile,
    assimilationLocked
], Colony);
export { Colony };
