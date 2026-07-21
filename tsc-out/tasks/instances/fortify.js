var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const fortifyTaskName = 'fortify';
let TaskFortify = class TaskFortify extends Task {
    constructor(target, hitsMax, options = {}) {
        super(fortifyTaskName, target, options);
        // Settings
        this.settings.timeout = 100; // Don't want workers to fortify indefinitely
        this.settings.targetRange = 3;
        this.settings.workOffRoad = true;
        this.data.hitsMax = hitsMax;
    }
    isValidTask() {
        return (this.creep.carry.energy > 0); // Times out once creep is out of energy
    }
    isValidTarget() {
        return !!this.target && this.target.hits < (this.data.hitsMax || this.target.hitsMax);
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.repair(this.target);
    }
};
TaskFortify = __decorate([
    profile
], TaskFortify);
export { TaskFortify };
