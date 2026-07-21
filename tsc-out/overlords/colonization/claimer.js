var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { $ } from '../../caching/GlobalCache';
import { Roles, Setups } from '../../creepSetups/setups';
import { Pathing } from '../../movement/Pathing';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Tasks } from '../../tasks/Tasks';
import { Overlord } from '../Overlord';
/**
 * Claim an unowned room
 */
let ClaimingOverlord = class ClaimingOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.colonization.claim) {
        super(directive, 'claim', priority);
        this.directive = directive;
        this.claimers = this.zerg(Roles.claim);
    }
    init() {
        const amount = $.number(this, 'claimerAmount', () => {
            if (this.room) { // if you have vision
                if (this.room.my) { // already claimed
                    return 0;
                }
                else { // don't ask for claimers if you can't reach controller
                    const pathablePos = this.room.creeps[0] ? this.room.creeps[0].pos
                        : Pathing.findPathablePosition(this.room.name);
                    if (!Pathing.isReachable(pathablePos, this.room.controller.pos, _.filter(this.room.structures, s => !s.isWalkable))) {
                        return 0;
                    }
                }
            }
            return 1; // otherwise ask for 1 claimer
        });
        const setup = this.colony.level > 4 ? Setups.infestors.fastClaim : Setups.infestors.claim;
        this.wishlist(amount, setup);
    }
    handleClaimer(claimer) {
        if (claimer.room == this.room && !claimer.pos.isEdge) {
            if (!this.room.controller.signedByMe) {
                // Takes care of an edge case where planned newbie zone signs prevents signing until room is reserved
                if (!this.room.my && this.room.controller.signedByScreeps) {
                    claimer.task = Tasks.claim(this.room.controller);
                }
                else {
                    claimer.task = Tasks.signController(this.room.controller);
                }
            }
            else {
                claimer.task = Tasks.claim(this.room.controller);
            }
        }
        else {
            claimer.goTo(this.pos, { pathOpts: { ensurePath: true, avoidSK: true } });
        }
    }
    run() {
        this.autoRun(this.claimers, claimer => this.handleClaimer(claimer));
        if (this.room && this.room.controller && this.room.controller.my && this.room.controller.signedByMe) {
            for (const claimer of this.claimers) {
                claimer.suicide();
            }
        }
    }
};
ClaimingOverlord = __decorate([
    profile
], ClaimingOverlord);
export { ClaimingOverlord };
