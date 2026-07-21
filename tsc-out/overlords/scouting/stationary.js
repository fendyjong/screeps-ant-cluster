var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Roles, Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
/**
 * Sends out a stationary scout, which travels to a waypoint and remains there indefinitely
 */
let StationaryScoutOverlord = class StationaryScoutOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.scouting.stationary) {
        super(directive, 'scout', priority);
        this.scouts = this.zerg(Roles.scout, { notifyWhenAttacked: false });
    }
    init() {
        this.wishlist(1, Setups.scout);
    }
    run() {
        for (const scout of this.scouts) {
            // if (this.pos.roomName == scout.room.name) {
            // 	const enemyConstructionSites = scout.room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
            // 	const squashTarget = _.first(enemyConstructionSites);
            // 	if (squashTarget) {
            // 		scout.goTo(squashTarget);
            // 		return;
            // 	}
            // }
            if (!(scout.pos.inRangeTo(this.pos, 3) && !scout.pos.isEdge)) {
                scout.goTo(this.pos, { range: 3 });
            }
        }
    }
};
StationaryScoutOverlord = __decorate([
    profile
], StationaryScoutOverlord);
export { StationaryScoutOverlord };
