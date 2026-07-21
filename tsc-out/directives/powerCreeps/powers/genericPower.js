var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../../profiler/decorator';
import { powerId } from './generateOps';
/**
 * An abstract class for encapsulating power creep power usage.
 */
let Power = class Power {
    constructor(powerCreep, target) {
        // log.notify(`Creating power task for ${powerCreep}`);
        this._powerCreep = {
            name: powerCreep.name,
        };
        if (target) {
            this._target = {
                ref: target.ref,
                _pos: target.pos,
            };
        }
    }
    /**
     * Dereferences the Task's target
     */
    get target() {
        return deref(this._target.ref);
    }
    canRunPower() {
        const power = this.powerCreep.powers[powerId];
        return power && power.level > 0 && power.cooldown == 0;
    }
    /**
     * Return the wrapped creep which is executing this task
     */
    get powerCreep() {
        // Returns zerg wrapper instead of creep to use monkey-patched functions
        return Game.powerCreeps[this._powerCreep.name];
    }
    /**
     * Set the creep which is executing this task
     */
    set powerCreep(pc) {
        this._powerCreep.name = pc.name;
    }
    run() {
        if (this.canRunPower()) {
            this.operatePower();
        }
    }
    operatePower() {
    }
};
Power = __decorate([
    profile
], Power);
export { Power };
