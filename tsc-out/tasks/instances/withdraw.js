/* Withdraw a resource from a target */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const withdrawTaskName = 'withdraw';
let TaskWithdraw = class TaskWithdraw extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount, options = {}) {
        super(withdrawTaskName, target, options);
        // Settings
        this.settings.oneShot = true;
        this.settings.blind = true;
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        const amount = this.data.amount || 1;
        return (_.sum(this.creep.carry) <= this.creep.carryCapacity - amount);
    }
    isValidTarget() {
        const amount = this.data.amount || 1;
        return !!this.target && this.target.store.getUsedCapacity(this.data.resourceType) >= amount;
        // const target = this.target;
        // if (isTombstone(target) || isRuin(target) || isStoreStructure(target)) {
        // 	return (target.store[this.data.resourceType] || 0) >= amount;
        // } else if (isEnergyStructure(target) && this.data.resourceType == RESOURCE_ENERGY) {
        // 	return target.energy >= amount;
        // } else {
        // 	if (target instanceof StructureLab) {
        // 		return this.data.resourceType == target.mineralType && target.mineralAmount >= amount;
        // 	} else if (target instanceof StructurePowerSpawn) {
        // 		return this.data.resourceType == RESOURCE_POWER && target.power >= amount;
        // 	}
        // }
        // return false;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.withdraw(this.target, this.data.resourceType, this.data.amount);
    }
};
TaskWithdraw = __decorate([
    profile
], TaskWithdraw);
export { TaskWithdraw };
