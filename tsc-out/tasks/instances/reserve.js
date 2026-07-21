var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const reserveTaskName = 'colony';
let TaskReserve = class TaskReserve extends Task {
    constructor(target, options = {}) {
        super(reserveTaskName, target, options);
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(CLAIM) > 0);
    }
    isValidTarget() {
        const target = this.target;
        return !!target && (!target.reservation || target.reservation.ticksToEnd < 4999);
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        let ret = this.creep.reserveController(this.target);
        if (ret == ERR_INVALID_TARGET) {
            ret = this.creep.attackController(this.target);
        }
        return ret;
    }
};
TaskReserve = __decorate([
    profile
], TaskReserve);
export { TaskReserve };
