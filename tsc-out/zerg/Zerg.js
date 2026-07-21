var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../console/log';
import { isCreep, isPowerCreep, isStandardZerg } from '../declarations/typeGuards';
import { CombatIntel } from '../intel/CombatIntel';
import { Movement } from '../movement/Movement';
import { profile } from '../profiler/decorator';
import { BOOST_PARTS } from '../resources/map_resources';
import { initializeTask } from '../tasks/initializer';
import { MIN_LIFETIME_FOR_BOOST } from '../tasks/instances/getBoosted';
import { stringToColorHash } from '../utilities/utils';
import { Visualizer } from '../visuals/Visualizer';
import { AnyZerg } from './AnyZerg';
export function normalizeStandardZerg(creep) {
    return Overmind.zerg[creep.name] || creep;
}
export function toCreep(creep) {
    return isStandardZerg(creep) ? creep.creep : creep;
}
// Last pipeline is more complex because it depends on the energy a creep has; sidelining this for now
const ACTION_PIPELINES = [
    ['harvest', 'attack', 'build', 'repair', 'dismantle', 'attackController', 'rangedHeal', 'heal'],
    ['rangedAttack', 'rangedMassAttack', 'build', 'repair', 'rangedHeal'],
    // ['upgradeController', 'build', 'repair', 'withdraw', 'transfer', 'drop'],
];
const RANGES = {
    BUILD: 3,
    REPAIR: 3,
    TRANSFER: 1,
    WITHDRAW: 1,
    HARVEST: 1,
    DROP: 0,
};
/**
 * The Zerg class is a wrapper for owned creeps and contains all wrapped creep methods and many additional methods for
 * direct control of a creep. As of April 2020, this class now extends the AnyZerg class to accommodate the introduction
 * of power creeps into the game.
 */
let Zerg = class Zerg extends AnyZerg {
    constructor(creep, notifyWhenAttacked = true) {
        super(creep, notifyWhenAttacked);
        this.isStandardZerg = true;
        // Copy over creep references
        // this.creep = creep;
        this.body = creep.body;
        // this.carry = creep.carry;
        // this.store = creep.store;
        // this.carryCapacity = creep.carryCapacity;
        this.fatigue = creep.fatigue;
        // this.hits = creep.hits;
        // this.hitsMax = creep.hitsMax;
        // this.id = creep.id;
        // this.memory = creep.memory;
        // this.name = creep.name;
        // this.pos = creep.pos;
        // this.nextPos = creep.pos;
        // this.ref = creep.ref;
        this.roleName = creep.memory.role;
        // this.room = creep.room;
        // this.saying = creep.saying;
        this.spawning = creep.spawning;
        // this.ticksToLive = creep.ticksToLive;
        // Extra properties
        // this.lifetime = this.getBodyparts(CLAIM) > 0 ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
        // this.actionLog = {};
        // this.blockMovement = false;
        // Register global references
        Overmind.zerg[this.name] = this;
        // global[this.name] = this;
        // Handle attack notification when at lifetime - 1
        // if (!notifyWhenAttacked && (this.ticksToLive || 0) >= this.lifetime - (NEW_OVERMIND_INTERVAL + 1)) {
        // 	// creep.notifyWhenAttacked only uses the 0.2CPU intent cost if it changes the intent value
        // 	this.notifyWhenAttacked(notifyWhenAttacked);
        // }
    }
    /**
     * Refresh all changeable properties of the creep or delete from Overmind and global when dead
     */
    refresh() {
        super.refresh();
        const creep = Game.creeps[this.name];
        if (creep) {
            // this.creep = creep;
            // this.pos = creep.pos;
            // this.nextPos = creep.pos;
            this.body = creep.body;
            // this.carry = creep.carry;
            // this.store = creep.store;
            // this.carryCapacity = creep.carryCapacity;
            this.fatigue = creep.fatigue;
            // this.hits = creep.hits;
            // this.memory = creep.memory;
            this.roleName = creep.memory.role;
            // this.room = creep.room;
            // this.saying = creep.saying;
            this.spawning = creep.spawning;
            // this.ticksToLive = creep.ticksToLive;
            // this.actionLog = {};
            // this.blockMovement = false;
            this._task = null; // todo
            this._neededBoosts = undefined;
        }
        else {
            // log.debug(`Deleting from global`);
            delete Overmind.zerg[this.name];
            // delete global[this.name];
        }
    }
    get ticksUntilSpawned() {
        if (this.spawning) {
            const spawner = this.pos.lookForStructure(STRUCTURE_SPAWN);
            if (spawner && spawner.spawning) {
                return spawner.spawning.remainingTime;
            }
            else {
                // Shouldn't ever get here
                console.log(`Error determining ticks to spawn for ${this.name} @ ${this.pos.print}!`);
            }
        }
    }
    // Wrapped creep methods ===========================================================================================
    attack(target) {
        const result = this.creep.attack(target);
        if (result == OK) {
            this.actionLog.attack = true;
            if (isCreep(target) || isPowerCreep(target)) {
                if (target.hitsPredicted == undefined)
                    target.hitsPredicted = target.hits;
                target.hitsPredicted -= CombatIntel.predictedDamageAmount(this.creep, target, 'attack');
            }
            if (isCreep(target)) {
                // account for hitback effects
                if (this.creep.hitsPredicted == undefined)
                    this.creep.hitsPredicted = this.creep.hits;
                this.creep.hitsPredicted -= CombatIntel.predictedDamageAmount(target, this.creep, 'attack');
            }
            if (this.memory.talkative)
                this.say(`💥`);
        }
        return result;
    }
    attackController(controller) {
        const result = this.creep.attackController(controller);
        if (!this.actionLog.attackController)
            this.actionLog.attackController = (result == OK);
        return result;
    }
    build(target) {
        const result = this.creep.build(target);
        if (!this.actionLog.build)
            this.actionLog.build = (result == OK);
        return result;
    }
    goBuild(target) {
        if (this.build(target) == ERR_NOT_IN_RANGE) {
            this.goTo(target);
        }
    }
    // cancelOrder(methodName: string): OK | ERR_NOT_OWNER | ERR_BUSY | ERR_NOT_FOUND {
    // 	const result = this.creep.cancelOrder(methodName);
    // 	if (result == OK) this.actionLog[methodName] = false;
    // 	return result;
    // }
    claimController(controller) {
        const result = this.creep.claimController(controller);
        if (!this.actionLog.claimController)
            this.actionLog.claimController = (result == OK);
        if (result == OK) {
            Overmind.shouldBuild = true; // rebuild the overmind object on the next tick to account for new room
        }
        return result;
    }
    dismantle(target) {
        const result = this.creep.dismantle(target);
        if (!this.actionLog.dismantle)
            this.actionLog.dismantle = (result == OK);
        return result;
    }
    goDismantle(target) {
        if (this.dismantle(target) == ERR_NOT_IN_RANGE) {
            this.goTo(target);
        }
    }
    // drop(resourceType: ResourceConstant, amount?: number) {
    // 	const result = this.creep.drop(resourceType, amount);
    // 	if (!this.actionLog.drop) this.actionLog.drop = (result == OK);
    // 	return result;
    // }
    // goDrop(pos: RoomPosition, resourceType: ResourceConstant, amount?: number) {
    // 	if (this.pos.inRangeToPos(pos, RANGES.DROP)) {
    // 		return this.drop(resourceType, amount);
    // 	} else {
    // 		return this.goTo(pos);
    // 	}
    // }
    generateSafeMode(target) {
        return this.creep.generateSafeMode(target);
    }
    harvest(source) {
        const result = this.creep.harvest(source);
        if (!this.actionLog.harvest)
            this.actionLog.harvest = (result == OK);
        return result;
    }
    goHarvest(source) {
        if (this.harvest(source) == ERR_NOT_IN_RANGE) {
            this.goTo(source);
        }
    }
    // move(direction: DirectionConstant, force = false) {
    // 	if (!this.blockMovement && !force) {
    // 		const result = this.creep.move(direction);
    // 		if (result == OK) {
    // 			if (!this.actionLog.move) this.actionLog.move = true;
    // 			this.nextPos = this.pos.getPositionAtDirection(direction);
    // 		}
    // 		return result;
    // 	} else {
    // 		return ERR_BUSY;
    // 	}
    // }
    // notifyWhenAttacked(enabled: boolean) {
    // 	return this.creep.notifyWhenAttacked(enabled);
    // }
    // pickup(resource: Resource) {
    // 	const result = this.creep.pickup(resource);
    // 	if (!this.actionLog.pickup) this.actionLog.pickup = (result == OK);
    // 	return result;
    // }
    rangedAttack(target) {
        const result = this.creep.rangedAttack(target);
        if (result == OK) {
            this.actionLog.rangedAttack = true;
            if (isCreep(target)) {
                if (target.hitsPredicted == undefined)
                    target.hitsPredicted = target.hits;
                target.hitsPredicted -= CombatIntel.predictedDamageAmount(this, target, 'rangedAttack');
            }
            if (this.memory.talkative)
                this.say(`🔫`);
        }
        return result;
    }
    rangedMassAttack() {
        const result = this.creep.rangedMassAttack();
        if (result == OK) {
            this.actionLog.rangedMassAttack = true;
            for (const target of this.pos.findInRange(this.room.hostiles, 3)) {
                if (target.hitsPredicted == undefined)
                    target.hitsPredicted = target.hits;
                target.hitsPredicted -= CombatIntel.getMassAttackDamageTo(this, target);
            }
            if (this.memory.talkative)
                this.say(`💣`);
        }
        return result;
    }
    repair(target) {
        const result = this.creep.repair(target);
        if (!this.actionLog.repair)
            this.actionLog.repair = (result == OK);
        return result;
    }
    goRepair(target) {
        if (this.repair(target) == ERR_NOT_IN_RANGE) {
            this.goTo(target);
        }
    }
    reserveController(controller) {
        const result = this.creep.reserveController(controller);
        if (!this.actionLog.reserveController)
            this.actionLog.reserveController = (result == OK);
        return result;
    }
    // /* Say a message; maximum message length is 10 characters */
    // say(message: string, pub?: boolean) {
    // 	return this.creep.say(message, pub);
    // }
    signController(target, text) {
        const result = this.creep.signController(target, text);
        if (!this.actionLog.signController)
            this.actionLog.signController = (result == OK);
        return result;
    }
    // suicide() {
    // 	return this.creep.suicide();
    // }
    upgradeController(controller) {
        const result = this.creep.upgradeController(controller);
        if (!this.actionLog.upgradeController)
            this.actionLog.upgradeController = (result == OK);
        // Determine amount of upgrade power
        // let weightedUpgraderParts = _.map(this.boostCounts, )
        // let upgradeAmount = this.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER;
        // let upgrade
        // Stats.accumulate(`colonies.${this.colony.name}.rcl.progressTotal`, upgradeAmount);
        return result;
    }
    heal(target, rangedHealInstead = false) {
        if (rangedHealInstead && !this.pos.isNearTo(target)) {
            return this.rangedHeal(target);
        }
        const creep = toCreep(target);
        const result = this.creep.heal(creep);
        if (result == OK) {
            this.actionLog.heal = true;
            if (creep.hitsPredicted == undefined)
                creep.hitsPredicted = creep.hits;
            creep.hitsPredicted += CombatIntel.getHealAmount(this);
            if (this.memory.talkative)
                this.say('🚑');
        }
        return result;
    }
    rangedHeal(target) {
        const creep = toCreep(target);
        const result = this.creep.rangedHeal(creep);
        if (result == OK) {
            this.actionLog.rangedHeal = true;
            if (creep.hitsPredicted == undefined)
                creep.hitsPredicted = creep.hits;
            creep.hitsPredicted += CombatIntel.getRangedHealAmount(this);
            if (this.memory.talkative)
                this.say(`💉`);
        }
        return result;
    }
    // transfer(target: Creep | Zerg | Structure, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
    // 	let result: ScreepsReturnCode;
    // 	if (target instanceof Zerg) {
    // 		result = this.creep.transfer(target.creep, resourceType, amount);
    // 	} else {
    // 		result = this.creep.transfer(target, resourceType, amount);
    // 	}
    // 	if (!this.actionLog.transfer) this.actionLog.transfer = (result == OK);
    // 	return result;
    // }
    // goTransfer(target: Creep | Zerg | Structure, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
    // 	if (this.pos.inRangeToPos(target.pos, RANGES.TRANSFER)) {
    // 		return this.transfer(target, resourceType, amount);
    // 	} else {
    // 		return this.goTo(target);
    // 	}
    // }
    // withdraw(target: Structure | Tombstone | Ruin, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
    // 	const result = this.creep.withdraw(target, resourceType, amount);
    // 	if (!this.actionLog.withdraw) this.actionLog.withdraw = (result == OK);
    // 	return result;
    // }
    // goWithdraw(target: Structure | Tombstone, resourceType: ResourceConstant = RESOURCE_ENERGY, amount?: number) {
    // 	if (this.pos.inRangeToPos(target.pos, RANGES.WITHDRAW)) {
    // 		return this.withdraw(target, resourceType, amount);
    // 	} else {
    // 		return this.goTo(target);
    // 	}
    // }
    // Simultaneous creep actions --------------------------------------------------------------------------------------
    /**
     * Determine whether the given action will conflict with an action the creep has already taken.
     * See http://docs.screeps.com/simultaneous-actions.html for more details.
     */
    canExecute(actionName) {
        // Only one action can be executed from within a single pipeline
        let conflictingActions = [actionName];
        for (const pipeline of ACTION_PIPELINES) {
            if (pipeline.includes(actionName))
                conflictingActions = conflictingActions.concat(pipeline);
        }
        for (const action of conflictingActions) {
            if (this.actionLog[action]) {
                return false;
            }
        }
        return true;
    }
    // Body configuration and related data -----------------------------------------------------------------------------
    getActiveBodyparts(type) {
        return this.creep.getActiveBodyparts(type);
    }
    /**
     * The same as creep.getActiveBodyparts, but just counts bodyparts regardless of condition.
     */
    getBodyparts(partType) {
        return _.filter(this.body, (part) => part.type == partType).length;
    }
    // Custom creep methods ============================================================================================
    // Carry methods
    // get hasMineralsInCarry(): boolean {
    // 	for (const [resourceType, amount] of this.carry.contents) {
    // 		if (resourceType != RESOURCE_ENERGY && amount > 0) {
    // 			return true;
    // 		}
    // 	}
    // 	return false;
    // }
    // Boosting logic --------------------------------------------------------------------------------------------------
    get boostCounts() {
        return _.countBy(this.body, bodyPart => bodyPart.boost);
    }
    get bodypartCounts() {
        return this.creep.bodypartCounts;
    }
    get needsBoosts() {
        if (!this.overlord) {
            return false;
        }
        if ((this.ticksToLive || this.lifetime) < MIN_LIFETIME_FOR_BOOST * this.lifetime) {
            return false;
        }
        return !_.isEmpty(this.getNeededBoosts());
    }
    /**
     * Gets an object describing the amount of boosts (in minerals, not bodyparts) this Zerg needs. If the zerg is
     * fully boosted for a given resource type, the entry is removed from memory.needBoosts.
     */
    getNeededBoosts() {
        if (!this._neededBoosts) { // this is cleared each tick
            if (this.memory.needBoosts && this.memory.needBoosts.length > 0) {
                const neededBoosts = {};
                const boostCounts = this.boostCounts;
                const bodyCounts = this.bodypartCounts;
                for (const boost of _.cloneDeep(this.memory.needBoosts)) {
                    const bodypartType = BOOST_PARTS[boost];
                    if (!bodypartType) {
                        log.error(`${boost} is not a valid boost!`);
                    }
                    const numParts = bodyCounts[bodypartType] || 0;
                    const numBoostedParts = boostCounts[boost] || 0;
                    if (numBoostedParts < numParts) {
                        neededBoosts[boost] = LAB_BOOST_MINERAL * (numParts - numBoostedParts);
                    }
                    else {
                        _.pull(this.memory.needBoosts, boost);
                    }
                }
                this._neededBoosts = neededBoosts;
            }
            else {
                this._neededBoosts = {};
            }
        }
        return this._neededBoosts;
    }
    // Overlord logic --------------------------------------------------------------------------------------------------
    // get overlord(): Overlord | null {
    // 	return getOverlord(this);
    // }
    // set overlord(newOverlord: Overlord | null) {
    // 	setOverlord(this, newOverlord);
    // }
    // TODO add retire/reassignment logic
    // Eg. creep get repurposed, it gets recycled, etc
    /**
     * When a zerg has no more use for it's current overlord, it will be retired.
     * For now, that means RIP
     */
    retire() {
        this.say('💀 RIP 💀', true);
        return this.suicide();
    }
    /**
     * Reassigns the creep to work under a new overlord and as a new role.
     */
    reassign(newOverlord, newRole, invalidateTask = true) {
        this.overlord = newOverlord;
        if (newOverlord && newOverlord.colony && this.colony != newOverlord.colony) {
            this.colony = newOverlord.colony;
        }
        if (newRole) {
            this.roleName = newRole;
            this.memory.role = newRole;
        }
        if (invalidateTask) {
            this.task = null;
        }
    }
    // Task logic ------------------------------------------------------------------------------------------------------
    get targetedBy() {
        return this.creep.targetedBy;
    }
    /**
     * Wrapper for _task
     */
    get task() {
        if (!this._task) {
            this._task = this.memory.task ? initializeTask(this.memory.task) : null;
        }
        return this._task;
    }
    /**
     * Assign the creep a task with the setter, replacing creep.assign(Task)
     */
    set task(task) {
        // Unregister target from old task if applicable
        const oldProtoTask = this.memory.task;
        if (oldProtoTask) {
            const oldRef = oldProtoTask._target.ref;
            if (Overmind.cache.targets[oldRef]) {
                _.remove(Overmind.cache.targets[oldRef], name => name == this.name);
            }
        }
        // Set the new task
        this.memory.task = task ? task.proto : null;
        if (task) {
            if (task.target) {
                // Register task target in cache if it is actively targeting something (excludes goTo and similar)
                if (!Overmind.cache.targets[task.target.ref]) {
                    Overmind.cache.targets[task.target.ref] = [];
                }
                Overmind.cache.targets[task.target.ref].push(this.name);
            }
            // Register references to creep
            task.creep = this;
        }
        // Clear cache
        this._task = null;
    }
    /**
     * Does the creep have a valid task at the moment?
     */
    get hasValidTask() {
        return !!this.task && this.task.isValid();
    }
    /**
     * Creeps are idle if they don't have a valid task.
     */
    get isIdle() {
        return !this.task || !this.task.isValid();
    }
    debugger() {
        if (this.task && this.task.targetPos) {
            const color = stringToColorHash(this.name);
            Visualizer.circle(this.task.targetPos, color, { radius: 0.45 });
            // Visualizer.circle(this.pos, color, {radius: 0.45});
            Movement.visualizeMemorizedPath(this, color);
        }
    }
    /**
     * Execute the task you currently have.
     */
    run() {
        if (this.memory.debug) {
            this.debugger();
        }
        if (this.task) {
            return this.task.run();
        }
    }
};
Zerg = __decorate([
    profile
], Zerg);
export { Zerg };
