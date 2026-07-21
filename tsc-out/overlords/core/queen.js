var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Roles, Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Tasks } from '../../tasks/Tasks';
import { DEFAULT_PRESPAWN, Overlord } from '../Overlord';
/**
 * Spawns a dedicated hatchery attendant to refill spawns and extensions
 */
let QueenOverlord = class QueenOverlord extends Overlord {
    constructor(hatchery, priority = OverlordPriority.core.queen) {
        super(hatchery, 'supply', priority);
        this.hatchery = hatchery;
        this.queenSetup = this.colony.storage && !this.colony.state.isRebuilding ? Setups.queens.default
            : Setups.queens.early;
        this.queens = this.zerg(Roles.queen);
        this.settings = {
            refillTowersBelow: 500,
        };
    }
    init() {
        const amount = 1;
        const prespawn = this.hatchery.spawns.length <= 1 ? 100 : DEFAULT_PRESPAWN;
        this.wishlist(amount, this.queenSetup, { prespawn: prespawn });
    }
    supplyActions(queen) {
        // Select the closest supply target out of the highest priority and refill it
        const request = this.hatchery.transportRequests.getPrioritizedClosestRequest(queen.pos, 'supply');
        if (request) {
            queen.task = Tasks.transfer(request.target);
        }
        else {
            this.rechargeActions(queen); // if there are no targets, refill yourself
        }
    }
    rechargeActions(queen) {
        if (this.hatchery.link && !this.hatchery.link.isEmpty) {
            queen.task = Tasks.withdraw(this.hatchery.link);
        }
        else if (this.hatchery.batteries.length > 0) {
            const target = queen.pos.findClosestByRange(_.filter(this.hatchery.batteries, b => b.energy > 0));
            if (target) {
                queen.task = Tasks.withdraw(target);
            }
            else {
                queen.task = Tasks.recharge();
            }
        }
        else {
            queen.task = Tasks.recharge();
        }
    }
    idleActions(queen) {
        // will only have one battery when this overlord is called
        const battery = queen.pos.findClosestByRange(this.hatchery.batteries);
        if (this.hatchery.link) {
            // Can energy be moved from the link to the battery?
            if (battery && !battery.isFull && !this.hatchery.link.isEmpty) {
                // Move energy to battery as needed
                if (queen.carry.energy < queen.carryCapacity) {
                    queen.task = Tasks.withdraw(this.hatchery.link);
                }
                else {
                    queen.task = Tasks.transfer(battery);
                }
            }
            else {
                if (queen.carry.energy < queen.carryCapacity) { // make sure you're recharged
                    if (!this.hatchery.link.isEmpty) {
                        queen.task = Tasks.withdraw(this.hatchery.link);
                    }
                    else if (battery && !battery.isEmpty) {
                        queen.task = Tasks.withdraw(battery);
                    }
                }
            }
        }
        else {
            if (battery && queen.carry.energy < queen.carryCapacity) {
                queen.task = Tasks.withdraw(battery);
            }
        }
    }
    handleQueen(queen) {
        if (queen.carry.energy > 0) {
            this.supplyActions(queen);
        }
        else {
            this.rechargeActions(queen);
        }
        // If there aren't any tasks that need to be done, recharge the battery from link
        if (queen.isIdle) {
            this.idleActions(queen);
        }
        // // If all of the above is done and hatchery is not in emergencyMode, move to the idle point and renew as needed
        // if (!this.emergencyMode && queen.isIdle) {
        // 	if (queen.pos.isEqualTo(this.idlePos)) {
        // 		// If queen is at idle position, renew her as needed
        // 		if (queen.ticksToLive < this.settings.renewQueenAt && this.availableSpawns.length > 0) {
        // 			this.availableSpawns[0].renewCreep(queen.creep);
        // 		}
        // 	} else {
        // 		// Otherwise, travel back to idle position
        // 		queen.goTo(this.idlePos);
        // 	}
        // }
    }
    run() {
        for (const queen of this.queens) {
            // Get a task
            this.handleQueen(queen);
            // Run the task if you have one; else move back to idle pos
            if (queen.hasValidTask) {
                queen.run();
            }
            else {
                if (this.queens.length > 1) {
                    queen.goTo(this.hatchery.idlePos, { range: 1 });
                }
                else {
                    queen.goTo(this.hatchery.idlePos);
                }
            }
        }
    }
};
QueenOverlord = __decorate([
    profile
], QueenOverlord);
export { QueenOverlord };
