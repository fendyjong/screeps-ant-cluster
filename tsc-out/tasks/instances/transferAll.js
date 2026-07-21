var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const transferAllTaskName = 'transferAll';
let TaskTransferAll = class TaskTransferAll extends Task {
    constructor(target, skipEnergy = false, options = {}) {
        super(transferAllTaskName, target, options);
        this.data.skipEnergy = skipEnergy;
        this.settings.blind = false;
    }
    isValidTask() {
        for (const [resourceType, amount] of this.creep.carry.contents) {
            if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
                continue;
            }
            if (amount > 0) {
                return true;
            }
        }
        return false;
    }
    isValidTarget() {
        return !!this.target && _.sum(this.target.store) < this.target.store.getCapacity();
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        for (const [resourceType, amount] of this.creep.carry.contents) {
            if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
                continue;
            }
            if (amount > 0) {
                return this.creep.transfer(this.target, resourceType);
            }
        }
        return -1;
    }
};
TaskTransferAll = __decorate([
    profile
], TaskTransferAll);
export { TaskTransferAll };
