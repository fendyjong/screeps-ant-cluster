// Invalid task assigned if instantiation fails.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
const invalidTarget = {
    ref: '',
    pos: {
        x: 25,
        y: 25,
        roomName: 'W6N1',
    }
};
let TaskInvalid = class TaskInvalid extends Task {
    constructor() {
        super('INVALID', invalidTarget);
    }
    isValidTask() {
        return false;
    }
    isValidTarget() {
        return false;
    }
    work() {
        return OK;
    }
};
TaskInvalid = __decorate([
    profile
], TaskInvalid);
export { TaskInvalid };
