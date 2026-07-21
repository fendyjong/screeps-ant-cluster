var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { isSource } from '../../declarations/typeGuards';
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const harvestTaskName = 'harvest';
let TaskHarvest = class TaskHarvest extends Task {
    constructor(target, options = {}) {
        super(harvestTaskName, target, options);
    }
    isValidTask() {
        return _.sum(this.creep.carry) < this.creep.carryCapacity;
    }
    isValidTarget() {
        if (!this.target)
            return false;
        if (isSource(this.target)) {
            return this.target.energy > 0;
        }
        else {
            return this.target.mineralAmount > 0;
        }
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.harvest(this.target);
    }
};
TaskHarvest = __decorate([
    profile
], TaskHarvest);
export { TaskHarvest };
