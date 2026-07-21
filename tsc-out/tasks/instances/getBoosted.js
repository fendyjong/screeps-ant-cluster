var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { profile } from '../../profiler/decorator';
import { BOOST_PARTS } from '../../resources/map_resources';
import { Task } from '../Task';
export const getBoostedTaskName = 'getBoosted';
export const MIN_LIFETIME_FOR_BOOST = 0.85;
let TaskGetBoosted = class TaskGetBoosted extends Task {
    constructor(target, boostType, partCount, options = {}) {
        super(getBoostedTaskName, target, options);
        // Settings
        this.data.resourceType = boostType;
        this.data.amount = partCount;
    }
    isValidTask() {
        const lifetime = _.any(this.creep.body, part => part.type == CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
        if (this.creep.ticksToLive && this.creep.ticksToLive < MIN_LIFETIME_FOR_BOOST * lifetime) {
            return false; // timeout after this amount of lifespan has passed
        }
        // else if (BOOST_PARTS[this.data.resourceType] == MOVE &&
        // this.creep.getActiveBodyparts(BOOST_PARTS[this.data.resourceType]) >= this.creep.body.length / 2) {
        // 	Game.notify(`Bad boosting of move on creep ${this.creep}, invalid task.`);
        // 	return false;
        // }
        const partCount = (this.data.amount || this.creep.getActiveBodyparts(BOOST_PARTS[this.data.resourceType]));
        return (this.creep.boostCounts[this.data.resourceType] || 0) < partCount;
    }
    isValidTarget() {
        const partCount = (this.data.amount || this.creep.getActiveBodyparts(BOOST_PARTS[this.data.resourceType]));
        const lab = this.target;
        return !!lab &&
            lab.mineralType == this.data.resourceType &&
            lab.store[lab.mineralType] >= LAB_BOOST_MINERAL * partCount &&
            lab.store.energy >= LAB_BOOST_ENERGY * partCount;
    }
    work() {
        if (this.creep.spawning) {
            return ERR_INVALID_TARGET;
        }
        const partCount = (this.data.amount || this.creep.getActiveBodyparts(BOOST_PARTS[this.data.resourceType]));
        // if (BOOST_PARTS[this.data.resourceType] == MOVE && partCount >= this.creep.body.length / 2){
        // 	Game.notify(`Bad boosting of move on creep ${this.creep}, exiting work.`);
        // 	return ERR_INVALID_TARGET;
        // }
        const lab = this.target;
        if (!lab)
            return ERR_INVALID_TARGET;
        if (lab.mineralType == this.data.resourceType &&
            lab.store[lab.mineralType] >= LAB_BOOST_MINERAL * partCount &&
            lab.store.energy >= LAB_BOOST_ENERGY * partCount) {
            const result = this.target.boostCreep(deref(this._creep.name), this.data.amount);
            log.info(`Lab@${this.target.pos.print}: boosting creep ${this.creep.print} with ${this.target.mineralType}!`
                + ` Response: ${result}`);
            return result;
        }
        else {
            return ERR_NOT_FOUND;
        }
    }
};
TaskGetBoosted = __decorate([
    profile
], TaskGetBoosted);
export { TaskGetBoosted };
