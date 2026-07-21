var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const getRenewedTaskName = 'getRenewed';
let TaskGetRenewed = class TaskGetRenewed extends Task {
    constructor(target, options = {}) {
        super(getRenewedTaskName, target, options);
    }
    isValidTask() {
        const hasClaimPart = _.filter(this.creep.body, (part) => part.type == CLAIM).length > 0;
        const lifetime = hasClaimPart ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
        return this.creep.ticksToLive != undefined && this.creep.ticksToLive < 0.9 * lifetime;
    }
    isValidTarget() {
        return !!this.target && this.target.my && !this.target.spawning;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.target.renewCreep(this.creep.creep);
    }
};
TaskGetRenewed = __decorate([
    profile
], TaskGetRenewed);
export { TaskGetRenewed };
