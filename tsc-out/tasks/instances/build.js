var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const buildTaskName = 'build';
let TaskBuild = class TaskBuild extends Task {
    constructor(target, options = {}) {
        super(buildTaskName, target, options);
        // Settings
        this.settings.targetRange = 3;
        this.settings.workOffRoad = true;
    }
    isValidTask() {
        return this.creep.carry.energy > 0;
    }
    isValidTarget() {
        return !!this.target && this.target.my && this.target.progress < this.target.progressTotal;
    }
    work() {
        if (!this.target) {
            return ERR_INVALID_TARGET;
        }
        // Fixes issue #9 - workers freeze if creep sitting on square
        if (!this.target.isWalkable) {
            const creepOnTarget = this.target.pos.lookFor(LOOK_CREEPS)[0];
            if (creepOnTarget) {
                const zerg = Overmind.zerg[creepOnTarget.name];
                if (zerg) {
                    this.creep.say('move pls');
                    zerg.moveOffCurrentPos();
                }
            }
        }
        return this.creep.build(this.target);
    }
};
TaskBuild = __decorate([
    profile
], TaskBuild);
export { TaskBuild };
