var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const dismantleTaskName = 'dismantle';
let TaskDismantle = class TaskDismantle extends Task {
    constructor(target, options = {}) {
        super(dismantleTaskName, target, options);
        this.settings.timeout = 100;
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(WORK) > 0);
    }
    isValidTarget() {
        return !!this.target && this.target.hits > 0;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.dismantle(this.target);
    }
};
TaskDismantle = __decorate([
    profile
], TaskDismantle);
export { TaskDismantle };
