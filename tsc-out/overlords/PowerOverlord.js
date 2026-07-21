var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../console/log';
import { profile } from '../profiler/decorator';
import { PowerZergOperator } from '../zerg/PowerZergOperator';
import { Overlord } from './Overlord';
const getDefaultPowerOverlordMemory = () => ({
    ["T" /* MEM.TICK */]: Game.time,
});
/**
 * CombatOverlords extend the base Overlord class to provide additional combat-specific behavior
 */
let PowerOverlord = class PowerOverlord extends Overlord {
    constructor(initializer, name, priority, memDefauts = getDefaultPowerOverlordMemory) {
        super(initializer, name, priority, memDefauts);
        this._powerCreeps = {};
        this._powerZerg = {};
        this.recalculatePowerCreeps();
    }
    get age() {
        return Game.time - this.memory["T" /* MEM.TICK */];
    }
    refresh() {
        super.refresh();
        this.recalculatePowerCreeps();
        for (const role in this._powerCreeps) {
            for (const powerCreep of this._powerCreeps[role]) {
                if (Overmind.powerZerg[powerCreep.name]) {
                    Overmind.powerZerg[powerCreep.name].refresh();
                }
                else {
                    log.warning(`${this.print}: could not find and refresh power zerg with name ${powerCreep.name}!`);
                }
            }
        }
    }
    zerg(role, opts = {}) {
        log.error(`${this.print}: cannot call PowerOverlord.zerg()!`);
        return [];
    }
    combatZerg(role, opts = {}) {
        log.error(`${this.print}: cannot call PowerOverlord.combatZerg()!`);
        return [];
    }
    /**
     * Wraps all powerCreeps of a given role to PowerZerg objects and updates the contents in future ticks to avoid
     * having to explicitly refresh groups of PowerZerg
     */
    powerZerg(role, opts = {}) {
        if (!this._powerZerg[role]) {
            this._powerZerg[role] = [];
            this.synchronizePowerZerg(role, opts.notifyWhenAttacked);
        }
        return this._powerZerg[role];
    }
    recalculatePowerCreeps() {
        // Recalculate the sets of creeps for each role in this overlord
        this._powerCreeps = _.mapValues(Overmind.cache.overlords[this.ref], creepsOfRole => _.map(creepsOfRole, creepName => Game.powerCreeps[creepName]));
        // Update zerg and combatZerg records
        for (const role in this._powerZerg) {
            this.synchronizePowerZerg(role);
        }
    }
    synchronizePowerZerg(role, notifyWhenAttacked) {
        // Synchronize the corresponding sets of Zerg
        const zergNames = _.zipObject(_.map(this._powerZerg[role] || [], zerg => [zerg.name, true]));
        const creepNames = _.zipObject(_.map(this._powerCreeps[role] || [], creep => [creep.name, true]));
        // Add new creeps which aren't in the _zerg record
        for (const creep of this._powerCreeps[role] || []) {
            if (!zergNames[creep.name]) {
                if (Overmind.powerZerg[creep.name]) {
                    this._powerZerg[role].push(Overmind.powerZerg[creep.name]);
                }
                else {
                    switch (creep.className) {
                        case POWER_CLASS.OPERATOR:
                            this._powerZerg[role].push(new PowerZergOperator(creep, notifyWhenAttacked));
                            break;
                        default:
                            log.error(`NOT IMPLEMENTED`);
                            break;
                    }
                }
            }
        }
        // Remove dead/reassigned creeps from the _zerg record
        const removeZergNames = [];
        for (const powerZerg of this._powerZerg[role]) {
            if (!creepNames[powerZerg.name]) {
                removeZergNames.push(powerZerg.name);
            }
        }
        _.remove(this._powerZerg[role], deadZerg => removeZergNames.includes(deadZerg.name));
    }
    /**
     * Requests a power creep
     */
    requestPowerCreep(setup) {
        // TODO
    }
    /**
     * Wishlist of creeps to simplify spawning logic; includes automatic reporting
     */
    wishlistPC(setup, quantity = 1) {
        // TODO
    }
};
PowerOverlord = __decorate([
    profile
], PowerOverlord);
export { PowerOverlord };
