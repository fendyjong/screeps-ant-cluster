var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { $ } from '../../caching/GlobalCache';
import { Roles, Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Tasks } from '../../tasks/Tasks';
import { Overlord } from '../Overlord';
// Default memory should be wrapped as a function to avoid default-modifying bugs
const getDefaultTemplateOverlordMemory = () => ({
    memoryProperty1: 69,
});
/**
 * Template directive that you can copy/paste as an example of how to write a directive. Some description of what
 * the overlord does should go in this multi-comment.
 */
let TemplateOverlord = class TemplateOverlord extends Overlord {
    /**
     * constructor() tips:
     * - Never modify Colony.state from an overlord. Only directives are allowed to modify Colony.state
     * - It is generally best to avoid having references to the parent directive on an overlord. 90% of the time,
     *   this means that whatever you have on the directive can and should actually go on the overlord.
     */
    constructor(directive, priority = OverlordPriority.default) {
        super(directive, 'template', priority, getDefaultTemplateOverlordMemory);
        // You can use $.structures and similar methods to cache properties which won't change very often
        this.property0 = _.first(this.room.containers);
        this.property1 = $.structures(this, 'property1', () => _.filter(this.colony.spawns, spawn => spawn.pos.x > 20));
        this.property2 = $.structures(this, 'property2', () => {
            return _.sortBy(_.filter(this.room.ramparts, rampart => rampart.hits > 99999), rampart => rampart.hits);
        });
        // You shouldn't use $ methods for things that can frequently change
        this.property3 = _.filter(this.room.towers, tower => tower.store.getFreeCapacity(RESOURCE_ENERGY) > 100);
        // Cost matrices can be cached too
        this.property4 = $.costMatrix(this.pos.roomName, 'property2', () => {
            return new PathFinder.CostMatrix();
        });
        // Register zerg
        this.upgraders = this.zerg(Roles.upgrader);
        this.workers = this.zerg(Roles.worker);
    }
    /**
     * refresh() tips:
     * - Don't forget super.refresh()!
     * - You can use $.refresh() to refresh properties that you set with previous $ methods. The strings are also
     *   type-safe so you don't need to worry about mistpying things
     */
    refresh() {
        super.refresh();
        $.refresh(this, 'property1', 'property2');
        // Things that can change frequently will need to be refreshed
        this.property3 = _.filter(this.room.towers, tower => tower.store.getFreeCapacity(RESOURCE_ENERGY) > 100);
    }
    /**
     * Complex creep number calculations should be placed on a helper method
     */
    computeNeededWorkers() {
        return $.number(this, 'numWorkers', () => 42);
    }
    /**
     * Any logistics requests should be placed on init or on a private method placed above init which is named
     * register____Requests(). In general, register* means it is executed during init, while handle* means the method
     * is executed during run
     */
    registerEnergyRequests() {
        if (this.property0 && this.property0.store.getFreeCapacity() < 500) {
            this.colony.logisticsNetwork.requestOutput(this.property0, { resourceType: 'all' });
        }
    }
    /**
     * init() tips:
     *
     */
    init() {
        this.registerEnergyRequests();
        this.wishlist(1, Setups.upgraders.default);
        this.wishlist(1, Setups.workers.default);
    }
    // Zerg handling methods should be placed between init() and run() methods. Each method should be called
    // handleRole (where role is the name of the zerg role) and should take a single zerg as argument, returning void.
    // Decision trees should ideally be done using a flat structure with early returns
    handleUpgrader(upgrader) {
        // Go to the room and don't pick up energy until you're there
        if (!upgrader.safelyInRoom(this.room.name)) {
            upgrader.goToRoom(this.room.name);
            return;
        }
        // You're in the room, upgrade if you have energy
        if (upgrader.carry.energy > 0) {
            upgrader.task = Tasks.upgrade(this.colony.controller);
            return;
        }
        // If you're out of energy, recharge from link or battery
        if (this.colony.upgradeSite.link && this.colony.upgradeSite.link.energy > 0) {
            upgrader.task = Tasks.withdraw(this.colony.upgradeSite.link);
            return;
        }
        // Logic continues like this...
    }
    // As an alternate paradigm, for more complex decision tress, you can have a bunch of helper methods
    // that return a boolean, where true is returned if a task was assigned. These methods should all
    // be private and should be named taskActions (where task is the type of thing to do)
    repairActions(worker) {
        const target = worker.pos.findClosestByMultiRoomRange(this.property3);
        if (target) {
            worker.task = Tasks.repair(target);
            return true;
        }
        return false;
    }
    buildActions(worker) {
        const target = worker.pos.findClosestByMultiRoomRange(this.colony.constructionSites);
        if (target) {
            worker.task = Tasks.build(target);
            return true;
        }
        return false;
    }
    dismantleActions(worker) {
        const target = worker.pos.findClosestByRange(this.property2);
        if (target) {
            worker.task = Tasks.dismantle(target);
            return true;
        }
        return false;
    }
    handleWorker(worker) {
        // Get energy if needed
        if (worker.carry.energy == 0) {
            worker.task = Tasks.recharge();
            return;
        }
        // Highest priority actions
        if (this.repairActions(worker))
            return;
        // Second highest priority actions
        if (this.buildActions(worker))
            return;
        // Conditional action
        if (this.colony.spawns.length > 3) {
            if (this.dismantleActions(worker))
                return;
        }
        worker.say(`Nothing to do!`);
    }
    /**
     * run() tips:
     * - autoRun() is generally the best way to go for civilian roles
     */
    run() {
        this.autoRun(this.upgraders, upgrader => this.handleUpgrader(upgrader));
        this.autoRun(this.workers, carrier => this.handleWorker(carrier));
    }
};
// Put "magic numbers" in a static settings object so they are easier to see and adjust at a glance
TemplateOverlord.settings = {
    setting1: 0.99,
    setting2: 10000,
    nestedSettingObject: {
        0: 0,
        1: 1,
        2: 1,
        3: 2,
        4: 3,
        5: 5,
        6: 8,
        7: 13,
        8: 21,
    }
};
TemplateOverlord = __decorate([
    profile
], TemplateOverlord);
export { TemplateOverlord };
