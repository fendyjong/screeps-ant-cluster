var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../../console/log';
import { profile } from '../../../profiler/decorator';
import { Power } from './genericPower';
export const powerId = PWR_OPERATE_EXTENSION;
/**
 * An abstract class for encapsulating power creep power usage.
 */
let OperateExtension = class OperateExtension extends Power {
    constructor(powerCreep, target) {
        super(powerCreep, target);
    }
    operatePower() {
        if (this.powerCreep.carry.ops && this.powerCreep.carry.ops > 2 && this.powerCreep.room
            && this.powerCreep.room.energyAvailable < this.powerCreep.room.energyCapacityAvailable * 0.5) {
            const terminal = this.powerCreep.room.storage;
            if (!terminal) {
                log.error(`Ops power creep with no storage`);
            }
            else {
                this.powerCreep.moveTo(terminal);
                return this.powerCreep.usePower(powerId, terminal);
            }
        }
        return ERR_TIRED;
    }
};
OperateExtension = __decorate([
    profile
], OperateExtension);
export { OperateExtension };
