var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PairDestroyerOverlord_1;
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { DirectiveTargetSiege } from '../../directives/targeting/siegeTarget';
import { CombatIntel } from '../../intel/CombatIntel';
import { RoomIntel } from '../../intel/RoomIntel';
import { Movement } from '../../movement/Movement';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { CombatTargeting } from '../../targeting/CombatTargeting';
import { Overlord } from '../Overlord';
/**
 *  Destroyer overlord - spawns attacker/healer pairs for combat within a hostile room
 */
let PairDestroyerOverlord = PairDestroyerOverlord_1 = class PairDestroyerOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.offense.destroy) {
        super(directive, 'destroy', priority);
        this.directive = directive;
        this.attackers = this.combatZerg(Roles.melee, { notifyWhenAttacked: false });
        this.healers = this.combatZerg(Roles.healer, { notifyWhenAttacked: false });
    }
    findTarget(attacker) {
        if (this.room) {
            // Prioritize specifically targeted structures first
            const targetingDirectives = DirectiveTargetSiege.find(this.room.flags);
            const targetedStructures = _.compact(_.map(targetingDirectives, directive => directive.getTarget()));
            if (targetedStructures.length > 0) {
                return CombatTargeting.findClosestReachable(attacker.pos, targetedStructures);
            }
            else {
                // Target nearby hostile creeps
                const creepTarget = CombatTargeting.findClosestHostile(attacker, {
                    checkReachable: true,
                    ignoreCreepsAtEdge: true,
                    playerOnly: true,
                    onlyUnramparted: true
                });
                if (creepTarget)
                    return creepTarget;
                // Target nearby hostile structures
                const structureTarget = CombatTargeting.findClosestPrioritizedStructure(attacker);
                if (structureTarget)
                    return structureTarget;
            }
        } // TODO consider targets along path
    }
    attackActions(attacker, healer) {
        const target = this.findTarget(attacker);
        if (target) {
            if (attacker.pos.isNearTo(target)) {
                attacker.attack(target);
            }
            else {
                Movement.pairwiseMove(attacker, healer, target);
                attacker.autoMelee();
            }
        }
    }
    handleSquad(attacker) {
        const healer = attacker.findPartner(this.healers);
        // Case 1: you don't have an active healer
        if (!healer || healer.spawning || healer.needsBoosts) {
            // Wait near the colony controller if you don't have a healer
            if (attacker.pos.getMultiRoomRangeTo(this.colony.controller.pos) > 5) {
                attacker.goTo(this.colony.controller, { range: 5 });
            }
            else {
                attacker.park();
            }
        }
        // Case 2: you have an active healer
        else {
            // Activate retreat condition if necessary
            // Handle recovery if low on HP
            if (attacker.needsToRecover(PairDestroyerOverlord_1.settings.retreatHitsPercent) ||
                healer.needsToRecover(PairDestroyerOverlord_1.settings.retreatHitsPercent)) {
                // Healer leads retreat to fallback position
                Movement.pairwiseMove(healer, attacker, CombatIntel.getFallbackFrom(this.directive.pos));
            }
            else {
                // Move to room and then perform attacking actions
                if (!attacker.inSameRoomAs(this)) {
                    Movement.pairwiseMove(attacker, healer, this.pos);
                }
                else {
                    this.attackActions(attacker, healer);
                }
            }
        }
    }
    handleHealer(healer) {
        // If there are no hostiles in the designated room, run medic actions
        if (this.room && this.room.hostiles.length == 0 && this.room.hostileStructures.length == 0) {
            healer.doMedicActions(this.room.name);
            return;
        }
        const attacker = healer.findPartner(this.attackers);
        // Case 1: you don't have an attacker partner
        if (!attacker || attacker.spawning || attacker.needsBoosts) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            // Wait near the colony controller if you don't have an attacker
            if (healer.pos.getMultiRoomRangeTo(this.colony.controller.pos) > 5) {
                healer.goTo(this.colony.controller, { range: 5 });
            }
            else {
                healer.park();
            }
        }
        // Case 2: you have an attacker partner
        else {
            if (attacker.hitsMax - attacker.hits > healer.hitsMax - healer.hits) {
                healer.heal(attacker);
            }
            else {
                healer.heal(healer);
            }
        }
    }
    init() {
        let amount;
        if (this.directive.memory.amount) {
            amount = this.directive.memory.amount;
        }
        else {
            amount = 1;
        }
        if (RoomIntel.inSafeMode(this.pos.roomName)) {
            amount = 0;
        }
        const attackerPriority = this.attackers.length < this.healers.length ? this.priority - 0.1 : this.priority + 0.1;
        const attackerSetup = CombatSetups.zerglings.boosted.armored;
        this.wishlist(amount, attackerSetup, { priority: attackerPriority });
        const healerPriority = this.healers.length < this.attackers.length ? this.priority - 0.1 : this.priority + 0.1;
        const healerSetup = CombatSetups.transfusers.boosted.default;
        this.wishlist(amount, healerSetup, { priority: healerPriority });
    }
    run() {
        this.reassignIdleCreeps(Roles.healer);
        this.reassignIdleCreeps(Roles.melee);
        for (const attacker of this.attackers) {
            // Run the creep if it has a task given to it by something else; otherwise, proceed with non-task actions
            if (attacker.hasValidTask) {
                attacker.run();
            }
            else {
                if (attacker.needsBoosts) {
                    this.handleBoosting(attacker);
                }
                else {
                    this.handleSquad(attacker);
                }
            }
        }
        for (const healer of this.healers) {
            if (healer.hasValidTask) {
                healer.run();
            }
            else {
                if (healer.needsBoosts) {
                    this.handleBoosting(healer);
                }
                else {
                    this.handleHealer(healer);
                }
            }
        }
    }
};
PairDestroyerOverlord.settings = {
    retreatHitsPercent: 0.85,
    reengageHitsPercent: 0.95,
};
PairDestroyerOverlord = PairDestroyerOverlord_1 = __decorate([
    profile
], PairDestroyerOverlord);
export { PairDestroyerOverlord };
