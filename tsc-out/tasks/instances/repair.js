var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const repairTaskName = 'repair';
let TaskRepair = class TaskRepair extends Task {
    constructor(target, options = {}) {
        super(repairTaskName, target, options);
        // Settings
        this.settings.timeout = 100;
        this.settings.targetRange = 3;
    }
    isValidTask() {
        return this.creep.carry.energy > 0;
    }
    isValidTarget() {
        return !!this.target && this.target.hits < this.target.hitsMax;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        const result = this.creep.repair(this.target);
        if (this.target.structureType == STRUCTURE_ROAD) {
            // prevents workers from idling for a tick before moving to next target
            const newHits = this.target.hits + this.creep.getActiveBodyparts(WORK) * REPAIR_POWER;
            if (newHits > this.target.hitsMax) {
                this.finish();
            }
        }
        return result;
    }
};
TaskRepair = __decorate([
    profile
], TaskRepair);
export { TaskRepair };
