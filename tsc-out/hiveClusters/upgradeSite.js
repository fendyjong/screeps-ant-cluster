var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UpgradeSite_1;
import { $ } from '../caching/GlobalCache';
import { ColonyStage } from '../Colony';
import { log } from '../console/log';
import { Mem } from '../memory/Memory';
import { UpgradingOverlord } from '../overlords/core/upgrader';
import { profile } from '../profiler/decorator';
import { Stats } from '../stats/stats';
import { hasMinerals } from '../utilities/utils';
import { HiveCluster } from './_HiveCluster';
/**
 * Upgrade sites group upgrade-related structures around a controller, such as an input link and energy container
 */
let UpgradeSite = UpgradeSite_1 = class UpgradeSite extends HiveCluster {
    constructor(colony, controller) {
        super(colony, controller, 'upgradeSite');
        this.controller = controller;
        this.memory = Mem.wrap(this.colony.memory, 'upgradeSite');
        this.upgradePowerNeeded = this.getUpgradePowerNeeded();
        // Register bettery
        $.set(this, 'battery', () => {
            const allowableContainers = _.filter(this.room.containers, container => container.pos.findInRange(FIND_SOURCES, 1).length == 0); // only count containers that aren't near sources
            return this.pos.findClosestByLimitedRange(allowableContainers, 3);
        });
        this.batteryPos = $.pos(this, 'batteryPos', () => {
            if (this.battery) {
                return this.battery.pos;
            }
            const inputSite = this.findInputConstructionSite();
            if (inputSite) {
                return inputSite.pos;
            }
            return this.calculateBatteryPos() || log.alert(`Upgrade site at ${this.pos.print}: no batteryPos!`);
        });
        if (this.batteryPos)
            this.colony.destinations.push({ pos: this.batteryPos, order: 0 });
        // Register link
        $.set(this, 'link', () => this.pos.findClosestByLimitedRange(colony.availableLinks, 3));
        this.colony.linkNetwork.claimLink(this.link);
        // // Energy per tick is sum of upgrader body parts and nearby worker body parts
        // this.energyPerTick = $.number(this, 'energyPerTick', () =>
        // 	_.sum(this.overlord.upgraders, upgrader => upgrader.getActiveBodyparts(WORK)) +
        // 	_.sum(_.filter(this.colony.getCreepsByRole(WorkerSetup.role), worker =>
        // 			  worker.pos.inRangeTo((this.link || this.battery || this).pos, 2)),
        // 		  worker => worker.getActiveBodyparts(WORK)));
        // Compute stats
        this.stats();
    }
    refresh() {
        this.memory = Mem.wrap(this.colony.memory, 'upgradeSite');
        $.refreshRoom(this);
        $.refresh(this, 'controller', 'battery', 'link');
    }
    spawnMoarOverlords() {
        // Register overlord
        this.overlord = new UpgradingOverlord(this);
    }
    findInputConstructionSite() {
        const nearbyInputSites = this.pos.findInRange(this.room.constructionSites, 4, {
            filter: (s) => s.structureType == STRUCTURE_CONTAINER ||
                s.structureType == STRUCTURE_LINK,
        });
        return _.first(nearbyInputSites);
    }
    getUpgradePowerNeeded() {
        return $.number(this, 'upgradePowerNeeded', () => {
            if (this.room.storage) { // Workers perform upgrading until storage is set up
                const amountOver = Math.max(this.colony.assets.energy - UpgradeSite_1.settings.energyBuffer, 0);
                let upgradePower = 1 + Math.floor(amountOver / UpgradeSite_1.settings.energyPerBodyUnit);
                if (amountOver > 800000) {
                    upgradePower *= 4; // double upgrade power if we have lots of surplus energy
                }
                else if (amountOver > 500000) {
                    upgradePower *= 2;
                }
                if (this.controller.level == 8) {
                    if (this.colony.assets.energy < 30000) {
                        upgradePower = 0;
                    }
                    else {
                        upgradePower = Math.min(upgradePower, 15); // don't go above 15 work parts at RCL 8
                    }
                }
                else if (this.controller.level >= 6) {
                    // Can set a room to upgrade at an accelerated rate manually
                    upgradePower = this.memory.speedFactor != undefined ? upgradePower * this.memory.speedFactor : upgradePower;
                }
                return upgradePower;
            }
            else {
                return 0;
            }
        });
    }
    init() {
        // Register energy requests
        if (this.link && this.link.energy < UpgradeSite_1.settings.linksRequestBelow) {
            this.colony.linkNetwork.requestReceive(this.link);
        }
        const inThreshold = this.colony.stage == ColonyStage.Larva ? 0.75 : 0.5;
        if (this.battery) {
            if (this.colony.stage == ColonyStage.Larva) {
                if (this.battery.energy < inThreshold * this.battery.storeCapacity) {
                    const workers = this.colony.overlords.work.workers;
                    const energyPerTick = UPGRADE_CONTROLLER_POWER * _.sum(workers, worker => worker.getBodyparts(WORK));
                    this.colony.logisticsNetwork.requestInput(this.battery, { dAmountdt: energyPerTick });
                }
            }
            else {
                if (this.battery.energy < inThreshold * this.battery.storeCapacity) {
                    const energyPerTick = UPGRADE_CONTROLLER_POWER * this.upgradePowerNeeded;
                    this.colony.logisticsNetwork.requestInput(this.battery, { dAmountdt: energyPerTick });
                }
            }
            if (hasMinerals(this.battery.store)) { // get rid of any minerals in the container if present
                this.colony.logisticsNetwork.requestOutputMinerals(this.battery);
            }
        }
    }
    /**
     * Calculate where the input will be built for this site
     */
    calculateBatteryPos() {
        let originPos;
        if (this.colony.storage) {
            originPos = this.colony.storage.pos;
        }
        else if (this.colony.roomPlanner.storagePos) {
            originPos = this.colony.roomPlanner.storagePos;
        }
        else {
            return;
        }
        // Find all positions at range 2 from controller
        let inputLocations = [];
        for (const pos of this.pos.getPositionsAtRange(2)) {
            if (pos.isWalkable(true)) {
                inputLocations.push(pos);
            }
        }
        // Try to find locations where there is maximal standing room
        const maxNeighbors = _.max(_.map(inputLocations, pos => pos.availableNeighbors(true).length));
        inputLocations = _.filter(inputLocations, pos => pos.availableNeighbors(true).length >= maxNeighbors);
        // Return location closest to storage by path
        const inputPos = originPos.findClosestByPath(inputLocations);
        if (inputPos) {
            return inputPos;
        }
    }
    /**
     * Build a container output at the optimal location
     */
    buildBatteryIfMissing() {
        if (!this.battery && !this.findInputConstructionSite()) {
            const buildHere = this.batteryPos;
            if (buildHere) {
                const result = buildHere.createConstructionSite(STRUCTURE_CONTAINER);
                if (result == OK) {
                    return;
                }
                else {
                    log.warning(`Upgrade site at ${this.pos.print}: cannot build battery! Result: ${result}`);
                }
            }
        }
    }
    stats() {
        const defaults = {
            downtime: 0,
        };
        if (!this.memory.stats)
            this.memory.stats = defaults;
        _.defaults(this.memory.stats, defaults);
        // Compute downtime
        this.memory.stats.downtime = (this.memory.stats.downtime * (CREEP_LIFE_TIME - 1) +
            (this.battery ? +this.battery.isEmpty : 0)) / CREEP_LIFE_TIME;
        Stats.log(`colonies.${this.colony.name}.upgradeSite.downtime`, this.memory.stats.downtime);
    }
    run() {
        if (Game.time % 25 == 7 && this.colony.level >= 2) {
            this.buildBatteryIfMissing();
        }
    }
    visuals() {
        // let info = [];
        // if (this.controller.level != 8) {
        // 	let progress = `${Math.floor(this.controller.progress / 1000)}K`;
        // 	let progressTotal = `${Math.floor(this.controller.progressTotal / 1000)}K`;
        // 	let percent = `${Math.floor(100 * this.controller.progress / this.controller.progressTotal)}`;
        // 	info.push(`Progress: ${progress}/${progressTotal} (${percent}%)`);
        //
        // }
        // info.push(`Downtime: ${this.memory.stats.downtime.toPercent()}`);
        // Visualizer.showInfo(info, this);
    }
};
// energyPerTick: number;
UpgradeSite.settings = {
    energyBuffer: 100000, // Number of upgrader parts scales with energy minus this value
    energyPerBodyUnit: 20000, // Scaling factor: this much excess energy adds one extra body repetition // TODO: scaling needs to increase with new storage/terminal system
    minLinkDistance: 10, // Required distance to build link
    linksRequestBelow: 200, // Links request energy when less than this amount
};
UpgradeSite = UpgradeSite_1 = __decorate([
    profile
], UpgradeSite);
export { UpgradeSite };
