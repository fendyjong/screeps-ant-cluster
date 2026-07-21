var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Task } from '../Task';
export const signControllerTaskName = 'signController';
let TaskSignController = class TaskSignController extends Task {
    constructor(target, options = {}) {
        super(signControllerTaskName, target, options);
    }
    isValidTask() {
        return true;
    }
    isValidTarget() {
        const controller = this.target;
        return !!controller &&
            (!controller.sign || controller.sign.text != Memory.settings.signature) &&
            !controller.signedByScreeps;
    }
    work() {
        if (!this.target)
            return ERR_INVALID_TARGET;
        return this.creep.signController(this.target, Memory.settings.signature);
    }
};
TaskSignController = __decorate([
    profile
], TaskSignController);
export { TaskSignController };
