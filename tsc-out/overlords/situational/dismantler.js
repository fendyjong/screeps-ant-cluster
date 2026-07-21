var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { Pathing } from '../../movement/Pathing';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
/**
 * Spawns special-purpose dismantlers for transporting resources to/from a specified target
 */
let DismantleOverlord = class DismantleOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.tasks.dismantle) {
        super(directive, 'dismantle', priority);
        this.directive = directive;
        // this.target = target || Game.getObjectById(this.directive.memory.targetId) || undefined;
        this.dismantlers = this.zerg(Roles.dismantler);
    }
    init() {
        // Spawn a number of dismantlers, up to a max
        const MAX_DISMANTLERS = 2;
        let setup;
        if (!!this.directive.memory.attackInsteadOfDismantle) { // TODO: need to move this to the new CombatCreepSetup system
            setup = CombatSetups.dismantlers.attackDismantlers;
        }
        // else if (this.canBoostSetup(CombatSetups.dismantlers.boosted_T3)) {
        // 	setup = CombatSetups.dismantlers.boosted_T3;
        // }
        else {
            setup = CombatSetups.dismantlers.default;
        }
        setup = CombatSetups.dismantlers.default;
        const dismantlingParts = setup.getBodyPotential(!!this.directive.memory.attackInsteadOfDismantle
            ? ATTACK : WORK, this.colony);
        const dismantlingPower = dismantlingParts * (!!this.directive.memory.attackInsteadOfDismantle
            ? ATTACK_POWER : DISMANTLE_POWER);
        // Calculate total needed amount of dismantling power as (resource amount * trip distance)
        const tripDistance = Pathing.distance((this.colony).pos, this.directive.pos) || 0;
        const dismantleLifetimePower = (CREEP_LIFE_TIME - tripDistance) * dismantlingPower;
        // Calculate number of dismantlers
        if (this.directive.room && this.target && !this.directive.memory.numberSpots) {
            this.directive.getDismantleSpots(this.target.pos);
        }
        const nearbySpots = this.directive.memory.numberSpots != undefined ? this.directive.memory.numberSpots : 1;
        // needs to be reachable spots
        const dismantleNeeded = Math.ceil((this.target ? this.target.hits : 50000) / dismantleLifetimePower);
        const numDismantlers = Math.min(nearbySpots, MAX_DISMANTLERS, dismantleNeeded);
        // Request the dismantlers
        this.wishlist(numDismantlers, setup);
    }
    runDismantler(dismantler) {
        if (!dismantler.inSameRoomAs(this.directive)) {
            const goal = this.target || this.directive;
            dismantler.goTo(goal, { pathOpts: { avoidSK: true } });
        }
        else {
            if (!this.target) {
                if (this.directive.memory.targetId) {
                    this.target = Game.getObjectById(this.directive.memory.targetId.toString()) || undefined;
                }
                this.target = this.target || this.directive.getTarget();
                if (!this.target) {
                    log.error(`No target found for ${this.directive.print}`);
                }
            }
            else {
                const res = !!this.directive.memory.attackInsteadOfDismantle ? dismantler.attack(this.target)
                    : dismantler.dismantle(this.target);
                if (res == ERR_NOT_IN_RANGE) {
                    const ret = dismantler.goTo(this.target, {});
                    // TODO this is shit ⬇
                }
                else if (res == ERR_NO_BODYPART) {
                    // dismantler.suicide();
                }
            }
        }
    }
    run() {
        this.reassignIdleCreeps(Roles.dismantler);
        for (const dismantler of this.dismantlers) {
            // Run the creep if it has a task given to it by something else; otherwise, proceed with non-task actions
            if (dismantler.hasValidTask) {
                dismantler.run();
            }
            else {
                if (dismantler.needsBoosts) {
                    this.handleBoosting(dismantler);
                }
                else {
                    this.runDismantler(dismantler);
                }
            }
        }
        for (const dismantler of this.dismantlers) {
            this.runDismantler(dismantler);
        }
    }
};
DismantleOverlord = __decorate([
    profile
], DismantleOverlord);
export { DismantleOverlord };
