var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { Roles, Setups } from '../../creepSetups/setups';
import { Pathing } from '../../movement/Pathing';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Tasks } from '../../tasks/Tasks';
import { Overlord } from '../Overlord';
/**
 * Spawn pioneers - early workers which help to build a spawn in a new colony, then get converted to workers or drones
 */
let PioneerOverlord = class PioneerOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.colonization.pioneer) {
        super(directive, 'pioneer', priority);
        this.directive = directive;
        this.pioneers = this.zerg(Roles.pioneer);
        this.spawnSite = this.room ? _.filter(this.room.constructionSites, s => s.structureType == STRUCTURE_SPAWN)[0] : undefined;
    }
    refresh() {
        super.refresh();
        this.spawnSite = this.room ? _.filter(this.room.constructionSites, s => s.structureType == STRUCTURE_SPAWN)[0] : undefined;
    }
    init() {
        this.wishlist(4, Setups.pioneer);
    }
    findStructureBlockingController(pioneer) {
        const blockingPos = Pathing.findBlockingPos(pioneer.pos, pioneer.room.controller.pos, _.filter(pioneer.room.structures, s => !s.isWalkable));
        if (blockingPos) {
            const structure = blockingPos.lookFor(LOOK_STRUCTURES)[0];
            return structure || log.error(`${this.print}: no structure at blocking pos ${blockingPos.print}!`);
        }
    }
    handlePioneer(pioneer) {
        // Ensure you are in the assigned room
        if (pioneer.room == this.room && !pioneer.pos.isEdge) {
            // Remove any blocking structures preventing claimer from reaching controller
            if (!this.room.my && this.room.structures.length > 0) {
                const dismantleTarget = this.findStructureBlockingController(pioneer);
                if (dismantleTarget) {
                    pioneer.task = Tasks.dismantle(dismantleTarget);
                    return;
                }
            }
            // Build and recharge
            if (pioneer.carry.energy == 0) {
                pioneer.task = Tasks.recharge();
            }
            else if (this.room && this.room.controller && (this.room.controller.ticksToDowngrade <
                (0.1 * CONTROLLER_DOWNGRADE[this.room.controller.level])
                || !this.spawnSite)
                && !(this.room.controller.upgradeBlocked > 0)) {
                // Save controller if it's about to downgrade or if you have nothing else to do
                pioneer.task = Tasks.upgrade(this.room.controller);
            }
            else if (this.spawnSite) {
                pioneer.task = Tasks.build(this.spawnSite);
            }
        }
        else {
            // pioneer.task = Tasks.goTo(this.pos);
            pioneer.goTo(this.pos, { pathOpts: { ensurePath: true, avoidSK: true } });
        }
    }
    run() {
        this.autoRun(this.pioneers, pioneer => this.handlePioneer(pioneer));
    }
};
PioneerOverlord = __decorate([
    profile
], PioneerOverlord);
export { PioneerOverlord };
