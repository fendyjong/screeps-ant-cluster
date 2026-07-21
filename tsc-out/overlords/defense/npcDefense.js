var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { DirectiveHaul } from '../../directives/resource/haul';
import { DirectiveTargetSiege } from '../../directives/targeting/siegeTarget';
import { RoomIntel } from '../../intel/RoomIntel';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
/**
 * NPC defense overlord: spawns specially-optimized guards as needed to deal with standard NPC invasions
 */
let DefenseNPCOverlord = class DefenseNPCOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.outpostDefense.guard) {
        super(directive, 'guard', priority);
        this.guards = this.combatZerg(Roles.guardMelee);
    }
    // private reassignIdleGuards(): void {
    // 	// Find all idle guards
    // 	let idleGuards = _.filter(this.colony.getCreepsByRole('guard'), (guard: Zerg) => !guard.overlord);
    // 	// Reassign them all to this flag
    // 	for (let guard of idleGuards) {
    // 		guard.overlord = this;
    // 	}
    // 	// Refresh the list of guards
    // 	this.guards = this.creeps('guard');
    // }
    findAttackTarget(guard) {
        const targetingDirectives = DirectiveTargetSiege.find(guard.room.flags);
        const targetedStructures = _.compact(_.map(targetingDirectives, directive => directive.getTarget()));
        if (targetedStructures.length > 0) {
            return guard.pos.findClosestByRange(targetedStructures);
        }
        if (guard.room.hostiles.length > 0) {
            const targets = _.filter(guard.room.hostiles, hostile => hostile.pos.rangeToEdge > 0);
            return guard.pos.findClosestByRange(targets);
        }
        if (guard.room.hostileStructures.length > 0) {
            const haulFlags = DirectiveHaul.find(guard.room.flags);
            if (haulFlags.length == 0) {
                return guard.pos.findClosestByRange(guard.room.hostileStructures);
            }
        }
    }
    /**
     * Attack and chase the specified target
     */
    combatActions(guard, target) {
        // Attack the target if you can, else move to get in range
        guard.attackAndChase(target);
        // Heal yourself if it won't interfere with attacking
        guard.healSelfIfPossible();
    }
    handleGuard(guard) {
        if (!guard.inSameRoomAs(this) || guard.pos.isEdge) {
            // Move into the assigned room if there is a guard flag present
            guard.goToRoom(this.pos.roomName);
        }
        else { // If you're in the assigned room or if there is no assignment, try to attack or heal
            const attackTarget = this.findAttackTarget(guard);
            if (attackTarget) {
                this.combatActions(guard, attackTarget);
            }
            else {
                guard.doMedicActions(this.pos.roomName);
            }
        }
    }
    init() {
        const amount = this.room && (this.room.invaders.length > 0 || RoomIntel.isInvasionLikely(this.room)) ? 1 : 0;
        this.wishlist(amount, CombatSetups.broodlings.default, { reassignIdle: true });
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
DefenseNPCOverlord.requiredRCL = 3;
DefenseNPCOverlord = __decorate([
    profile
], DefenseNPCOverlord);
export { DefenseNPCOverlord };
