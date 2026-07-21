var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TaskDrop_1;
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const dropTaskName = 'drop';
let TaskDrop = TaskDrop_1 = class TaskDrop extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount, options = {}) {
        super(TaskDrop_1.taskName, { ref: '', pos: target.pos }, options);
        // Settings
        this.settings.targetRange = 0;
        this.settings.oneShot = true;
        // Data
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        const amount = this.data.amount || 1;
        const resourcesInCarry = this.creep.carry[this.data.resourceType] || 0;
        return resourcesInCarry >= amount;
    }
    isValidTarget() {
        return true;
    }
    isValid() {
        // It's necessary to override task.isValid() for tasks which do not have a RoomObject target
        let validTask = false;
        if (this.creep) {
            validTask = this.isValidTask();
        }
        // Return if the task is valid; if not, finalize/delete the task and return false
        if (validTask) {
            return true;
        }
        else {
            // Switch to parent task if there is one
            let isValid = false;
            if (this.parent) {
                isValid = this.parent.isValid();
            }
            this.finish();
            return isValid;
        }
    }
    work() {
        return this.creep.drop(this.data.resourceType, this.data.amount);
    }
};
TaskDrop.taskName = 'drop';
TaskDrop = TaskDrop_1 = __decorate([
    profile
], TaskDrop);
export { TaskDrop };
