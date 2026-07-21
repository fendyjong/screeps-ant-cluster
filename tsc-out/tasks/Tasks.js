var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../profiler/decorator';
import { TaskAttack } from './instances/attack';
import { TaskBuild } from './instances/build';
import { TaskClaim } from './instances/claim';
import { TaskDismantle } from './instances/dismantle';
import { TaskDrop } from './instances/drop';
// import {fleeTargetType, TaskFlee} from './instances/flee';
import { TaskFortify } from './instances/fortify';
import { TaskGenerateSafeMode } from './instances/generateSafeMode';
import { TaskGetBoosted } from './instances/getBoosted';
import { TaskGetRenewed } from './instances/getRenewed';
import { TaskGoToRoom } from './instances/goToRoom';
import { TaskHarvest } from './instances/harvest';
import { TaskHeal } from './instances/heal';
import { TaskMeleeAttack } from './instances/meleeAttack';
import { TaskPickup } from './instances/pickup';
import { TaskRangedAttack } from './instances/rangedAttack';
import { TaskRecharge } from './instances/recharge';
import { TaskRepair } from './instances/repair';
import { TaskReserve } from './instances/reserve';
import { TaskSignController } from './instances/signController';
import { TaskTransfer } from './instances/transfer';
import { TaskTransferAll } from './instances/transferAll';
import { TaskUpgrade } from './instances/upgrade';
import { TaskWithdraw } from './instances/withdraw';
import { TaskWithdrawAll } from './instances/withdrawAll';
/**
 * Tasks class provides conveient wrappers for dispensing new Task instances
 */
let Tasks = class Tasks {
    static chain(tasks, setNextPos = true) {
        if (tasks.length == 0) {
            // log.error(`Tasks.chain was passed an empty array of tasks!`);
            return null;
        }
        if (setNextPos) {
            for (let i = 0; i < tasks.length - 1; i++) {
                tasks[i].options.nextPos = tasks[i + 1].targetPos;
            }
        }
        // Make the accumulator task from the end and iteratively fork it
        let task = _.last(tasks); // start with last task
        tasks = _.dropRight(tasks); // remove it from the list
        for (let i = (tasks.length - 1); i >= 0; i--) { // iterate over the remaining tasks
            task = task.fork(tasks[i]);
        }
        return task;
    }
    static attack(target, options = {}) {
        return new TaskAttack(target, options);
    }
    static build(target, options = {}) {
        return new TaskBuild(target, options);
    }
    static claim(target, options = {}) {
        return new TaskClaim(target, options);
    }
    static dismantle(target, options = {}) {
        return new TaskDismantle(target, options);
    }
    static drop(target, resourceType = RESOURCE_ENERGY, amount, options = {}) {
        return new TaskDrop(target, resourceType, amount, options);
    }
    // static flee(target: fleeTargetType, options = {} as TaskOptions) {
    // 	return new TaskFlee(target, options);
    // }
    static fortify(target, hitsMax, options = {}) {
        return new TaskFortify(target, hitsMax, options);
    }
    static getBoosted(target, boostType, amount, options = {}) {
        return new TaskGetBoosted(target, boostType, amount, options);
    }
    static getRenewed(target, options = {}) {
        return new TaskGetRenewed(target, options);
    }
    // static goTo(target: RoomPosition | HasPos, options = {} as TaskOptions): TaskGoToRoom {
    // 	if (hasPos(target)) {
    // 		return new TaskGoToRoom({ref: '', pos: target.pos}, options);
    // 	} else {
    // 		return new TaskGoToRoom({ref: '', pos: target}, options);
    // 	}
    // }
    static goToRoom(roomName, options = {}) {
        const fakeTargetPos = { ref: '', pos: new RoomPosition(25, 25, roomName) };
        return new TaskGoToRoom(fakeTargetPos, options);
    }
    static harvest(target, options = {}) {
        return new TaskHarvest(target, options);
    }
    static heal(target, options = {}) {
        return new TaskHeal(target, options);
    }
    static meleeAttack(target, options = {}) {
        return new TaskMeleeAttack(target, options);
    }
    static pickup(target, options = {}) {
        return new TaskPickup(target, options);
    }
    static rangedAttack(target, options = {}) {
        return new TaskRangedAttack(target, options);
    }
    static recharge(minEnergy = 0, options = {}) {
        return new TaskRecharge(minEnergy, options);
    }
    static repair(target, options = {}) {
        return new TaskRepair(target, options);
    }
    static reserve(target, options = {}) {
        return new TaskReserve(target, options);
    }
    static signController(target, options = {}) {
        return new TaskSignController(target, options);
    }
    static transfer(target, resourceType = RESOURCE_ENERGY, amount, options = {}) {
        return new TaskTransfer(target, resourceType, amount, options);
    }
    static transferAll(target, skipEnergy = false, options = {}) {
        return new TaskTransferAll(target, skipEnergy, options);
    }
    static upgrade(target, options = {}) {
        return new TaskUpgrade(target, options);
    }
    static withdraw(target, resourceType = RESOURCE_ENERGY, amount, options = {}) {
        return new TaskWithdraw(target, resourceType, amount, options);
    }
    static withdrawAll(target, options = {}) {
        return new TaskWithdrawAll(target, options);
    }
    static generateSafeMode(target, options = {}) {
        return new TaskGenerateSafeMode(target, options);
    }
};
Tasks = __decorate([
    profile
], Tasks);
export { Tasks };
