var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
/**
 * Guard swarm overlord: spawns lots of smaller guards to deal with swarm-like attacks or harassments
 */
let GuardSwarmOverlord = class GuardSwarmOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.outpostDefense.guard) {
        super(directive, 'swarmGuard', priority);
        this.directive = directive;
        this.guards = this.combatZerg(Roles.guardMelee);
    }
    findAttackTarget(guard) {
        if (guard.room.hostiles.length > 0) {
            const targets = _.filter(guard.room.hostiles, hostile => hostile.pos.rangeToEdge > 0);
            return guard.pos.findClosestByRange(targets);
        }
        if (guard.room.hostileStructures.length > 0) {
            return guard.pos.findClosestByRange(guard.room.hostileStructures);
        }
    }
    handleGuard(guard) {
        if (guard.pos.roomName != this.pos.roomName) { // TODO: make edge-safe
            // Move into the assigned room if there is a guard flag present
            guard.goToRoom(this.pos.roomName);
        }
        else { // If you're in the assigned room or if there is no assignment, try to attack or heal
            const attackTarget = this.findAttackTarget(guard);
            if (attackTarget) {
                guard.attackAndChase(attackTarget);
            }
            else {
                guard.park(this.pos); // Move off-road
            }
        }
    }
    init() {
        if (this.directive.memory.amount) {
            this.wishlist(this.directive.memory.amount, CombatSetups.broodlings.early);
        }
        else {
            if (this.room) {
                const smallHostiles = _.filter(this.room.dangerousHostiles, creep => creep.body.length < 10);
                if (smallHostiles.length > 2) {
                    this.wishlist(Math.round(smallHostiles.length), CombatSetups.broodlings.early);
                }
            }
            else {
                this.wishlist(2, CombatSetups.broodlings.early);
            }
        }
    }
    run() {
        for (const guard of this.guards) {
            // Run the creep if it has a task given to it by something else; otherwise, proceed with non-task actions
            if (guard.hasValidTask) {
                guard.run();
            }
            else {
                this.handleGuard(guard);
            }
        }
    }
};
GuardSwarmOverlord = __decorate([
    profile
], GuardSwarmOverlord);
export { GuardSwarmOverlord };
