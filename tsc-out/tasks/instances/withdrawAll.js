/* Withdraw a resource from a target */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const withdrawAllTaskName = 'withdrawAll';
let TaskWithdrawAll = class TaskWithdrawAll extends Task {
    constructor(target, options = {}) {
        super(withdrawAllTaskName, target, options);
        this.settings.blind = true;
    }
    isValidTask() {
        return (_.sum(this.creep.carry) < this.creep.carryCapacity);
    }
    isValidTarget() {
        return !!this.target && _.sum(this.target.store) > 0;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        let resourceTransferType;
        for (const [resourceType, amountInStore] of this.target.store.contents) {
            if (amountInStore > 0) {
                resourceTransferType = resourceType;
                // Prioritize non-energy
                if (resourceType != RESOURCE_ENERGY) {
                    break;
                }
            }
        }
        if (!!resourceTransferType) {
            return this.creep.withdraw(this.target, resourceTransferType);
        }
        return -1;
    }
};
TaskWithdrawAll = __decorate([
    profile
], TaskWithdrawAll);
export { TaskWithdrawAll };
