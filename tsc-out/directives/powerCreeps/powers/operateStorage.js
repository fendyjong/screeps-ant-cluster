var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../../console/log';
import { profile } from '../../../profiler/decorator';
import { Power } from './genericPower';
export const powerId = PWR_OPERATE_STORAGE;
/**
 * An abstract class for encapsulating power creep power usage.
 */
let OperateStorage = class OperateStorage extends Power {
    constructor(powerCreep, target) {
        super(powerCreep, target);
    }
    operatePower() {
        if (!this.powerCreep.room) {
            return ERR_BUSY;
        }
        const storage = this.powerCreep.room.storage;
        if (!storage) {
            log.error(`Ops power creep with no storage`);
            return ERR_NOT_FOUND;
        }
        if (this.powerCreep.store.ops && this.powerCreep.store.ops < 100 && storage) {
            this.powerCreep.withdraw(storage, RESOURCE_OPS, 1000);
        }
        if (this.powerCreep.store.ops && this.powerCreep.store.ops >= 100 && this.powerCreep.room) {
            this.powerCreep.moveTo(storage);
            return this.powerCreep.usePower(powerId, storage);
        }
        return ERR_TIRED;
    }
};
OperateStorage = __decorate([
    profile
], OperateStorage);
export { OperateStorage };
