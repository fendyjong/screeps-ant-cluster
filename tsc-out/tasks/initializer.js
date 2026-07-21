// Reinstantiation of a task object from ProtoTask data
import { log } from '../console/log';
import profiler from '../profiler/screeps-profiler';
import { attackTaskName, TaskAttack } from './instances/attack';
import { buildTaskName, TaskBuild } from './instances/build';
import { claimTaskName, TaskClaim } from './instances/claim';
import { dismantleTaskName, TaskDismantle } from './instances/dismantle';
import { dropTaskName, TaskDrop } from './instances/drop';
import { fortifyTaskName, TaskFortify } from './instances/fortify';
import { generateSafeModeTaskName, TaskGenerateSafeMode } from './instances/generateSafeMode';
import { getBoostedTaskName, TaskGetBoosted } from './instances/getBoosted';
import { getRenewedTaskName, TaskGetRenewed } from './instances/getRenewed';
import { goToTaskName } from './instances/goTo';
import { goToRoomTaskName, TaskGoToRoom } from './instances/goToRoom';
import { harvestTaskName, TaskHarvest } from './instances/harvest';
import { healTaskName, TaskHeal } from './instances/heal';
import { TaskInvalid } from './instances/invalid';
import { meleeAttackTaskName, TaskMeleeAttack } from './instances/meleeAttack';
import { pickupTaskName, TaskPickup } from './instances/pickup';
import { rangedAttackTaskName, TaskRangedAttack } from './instances/rangedAttack';
import { rechargeTaskName, TaskRecharge } from './instances/recharge';
import { repairTaskName, TaskRepair } from './instances/repair';
import { reserveTaskName, TaskReserve } from './instances/reserve';
import { signControllerTaskName, TaskSignController } from './instances/signController';
import { TaskTransfer, transferTaskName } from './instances/transfer';
// import {fleeTargetType, fleeTaskName, TaskFlee} from './instances/flee';
import { TaskTransferAll, transferAllTaskName } from './instances/transferAll';
import { TaskUpgrade, upgradeTaskName } from './instances/upgrade';
import { TaskWithdraw, withdrawTaskName } from './instances/withdraw';
import { TaskWithdrawAll, withdrawAllTaskName } from './instances/withdrawAll';
/**
 * The task initializer maps serialized prototasks to Task instances
 */
export function initializeTask(protoTask) {
    // Retrieve name and target data from the ProtoTask
    const taskName = protoTask.name;
    const target = deref(protoTask._target.ref);
    let task;
    // Create a task object of the correct type
    switch (taskName) {
        case attackTaskName:
            task = new TaskAttack(target);
            break;
        case buildTaskName:
            task = new TaskBuild(target);
            break;
        case claimTaskName:
            task = new TaskClaim(target);
            break;
        case dismantleTaskName:
            task = new TaskDismantle(target);
            break;
        case dropTaskName:
            task = new TaskDrop({ ref: '', pos: derefRoomPosition(protoTask._target._pos) });
            break;
        // case fleeTaskName:
        // 	task = new TaskFlee(derefRoomPosition(ProtoTask._target._pos) as fleeTargetType);
        // 	break;
        case fortifyTaskName:
            task = new TaskFortify(target);
            break;
        case getBoostedTaskName:
            task = new TaskGetBoosted(target, protoTask.data.resourceType);
            break;
        case getRenewedTaskName:
            task = new TaskGetRenewed(target);
            break;
        case goToTaskName:
            // task = new TaskGoTo(derefRoomPosition(ProtoTask._target._pos) as goToTargetType);
            task = new TaskInvalid();
            break;
        case goToRoomTaskName:
            task = new TaskGoToRoom({ ref: '', pos: derefRoomPosition(protoTask._target._pos) });
            break;
        case harvestTaskName:
            task = new TaskHarvest(target);
            break;
        case healTaskName:
            task = new TaskHeal(target);
            break;
        case meleeAttackTaskName:
            task = new TaskMeleeAttack(target);
            break;
        case pickupTaskName:
            task = new TaskPickup(target);
            break;
        case rangedAttackTaskName:
            task = new TaskRangedAttack(target);
            break;
        case rechargeTaskName:
            task = new TaskRecharge();
            break;
        case repairTaskName:
            task = new TaskRepair(target);
            break;
        case reserveTaskName:
            task = new TaskReserve(target);
            break;
        case signControllerTaskName:
            task = new TaskSignController(target);
            break;
        case transferTaskName:
            task = new TaskTransfer(target);
            break;
        case transferAllTaskName:
            task = new TaskTransferAll(target);
            break;
        case upgradeTaskName:
            task = new TaskUpgrade(target);
            break;
        case withdrawTaskName:
            task = new TaskWithdraw(target);
            break;
        case withdrawAllTaskName:
            task = new TaskWithdrawAll(target);
            break;
        case generateSafeModeTaskName:
            task = new TaskGenerateSafeMode(target);
            break;
        default:
            log.error(`Invalid task name: ${taskName}! task.creep: ${protoTask._creep.name}. Deleting from memory!`);
            task = new TaskInvalid();
            break;
    }
    // Modify the task object to reflect any changed properties
    task.proto = protoTask;
    // Return it
    return task;
}
profiler.registerFN(initializeTask, 'initializeTask');
