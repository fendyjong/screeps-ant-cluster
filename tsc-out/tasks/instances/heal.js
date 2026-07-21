var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const healTaskName = 'heal';
let TaskHeal = class TaskHeal extends Task {
    constructor(target, options = {}) {
        super(healTaskName, target, options);
        // Settings
        this.settings.targetRange = 3;
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(HEAL) > 0);
    }
    isValidTarget() {
        return !!this.target && this.target.hits < this.target.hitsMax && this.target.my;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        if (this.creep.pos.isNearTo(this.target)) {
            return this.creep.heal(this.target);
        }
        else {
            this.moveToTarget(1);
        }
        return this.creep.rangedHeal(this.target);
    }
};
TaskHeal = __decorate([
    profile
], TaskHeal);
export { TaskHeal };
