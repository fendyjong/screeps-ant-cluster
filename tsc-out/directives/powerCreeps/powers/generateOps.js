var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../../console/log';
import { profile } from '../../../profiler/decorator';
import { Power } from './genericPower';
export const powerId = PWR_GENERATE_OPS;
/**
 * An abstract class for encapsulating power creep power usage.
 */
let GenerateOps = class GenerateOps extends Power {
    constructor(powerCreep, target) {
        super(powerCreep, target);
    }
    operatePower() {
        if (this.powerCreep.carry.ops && this.powerCreep.carry.ops > (this.powerCreep.carryCapacity * 0.9)) {
            const storage = this.powerCreep.room.storage;
            if (!storage) {
                log.error(`Ops power creep with no storage`);
            }
            else {
                this.powerCreep.moveTo(storage);
                this.powerCreep.transfer(storage, RESOURCE_OPS, this.powerCreep.carry.ops);
            }
        }
        else {
            return this.powerCreep.usePower(powerId);
        }
        return ERR_TIRED;
    }
};
GenerateOps = __decorate([
    profile
], GenerateOps);
export { GenerateOps };
