var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const transferTaskName = 'transfer';
let TaskTransfer = class TaskTransfer extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount, options = {}) {
        super(transferTaskName, target, options);
        // Settings
        this.settings.oneShot = true;
        this.settings.blind = true;
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        const amount = this.data.amount || 1;
        const resourcesInCarry = this.creep.carry[this.data.resourceType] || 0;
        return resourcesInCarry >= amount;
    }
    isValidTarget() {
        const amount = this.data.amount || 1;
        // TODO: if you don't have vision of the creep (transferring to other creep?)
        return !!this.target && this.target.store.getFreeCapacity(this.data.resourceType) >= amount;
        // LEGACY:
        // const target = this.target;
        // if (target instanceof Creep) {
        // 	return _.sum(target.carry) <= target.carryCapacity - amount;
        // } else if (isStoreStructure(target)) {
        // 	return _.sum(target.store) <= target.storeCapacity - amount;
        // } else if (isEnergyStructure(target) && this.data.resourceType == RESOURCE_ENERGY) {
        // 	return target.energy <= target.energyCapacity - amount;
        // } else {
        // 	if (target instanceof StructureLab) {
        // 		return (target.mineralType == this.data.resourceType || !target.mineralType) &&
        // 			   target.mineralAmount <= target.mineralCapacity - amount;
        // 	} else if (target instanceof StructureNuker) {
        // 		return this.data.resourceType == RESOURCE_GHODIUM &&
        // 			   target.ghodium <= target.ghodiumCapacity - amount;
        // 	} else if (target instanceof StructurePowerSpawn) {
        // 		return this.data.resourceType == RESOURCE_POWER &&
        // 			   target.power <= target.powerCapacity - amount;
        // 	}
        // }
        // return false;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.transfer(this.target, this.data.resourceType, this.data.amount);
    }
};
TaskTransfer = __decorate([
    profile
], TaskTransfer);
export { TaskTransfer };
