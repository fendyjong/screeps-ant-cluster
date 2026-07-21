var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const generateSafeModeTaskName = 'generateSafeMode';
let TaskGenerateSafeMode = class TaskGenerateSafeMode extends Task {
    constructor(target, options = {}) {
        super(generateSafeModeTaskName, target, options);
    }
    isValidTask() {
        return (this.creep.carry[RESOURCE_GHODIUM] >= 1000);
    }
    isValidTarget() {
        // Allows targeting other players for allies
        return (!!this.target && !!this.target.owner);
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.generateSafeMode(this.target);
    }
};
TaskGenerateSafeMode = __decorate([
    profile
], TaskGenerateSafeMode);
export { TaskGenerateSafeMode };
