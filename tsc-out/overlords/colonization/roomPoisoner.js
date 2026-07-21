var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RoomPoisonerOverlord_1;
import { Roles, Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Tasks } from '../../tasks/Tasks';
import { packPos } from '../../utilities/packrat';
import { Overlord } from '../Overlord';
/**
 * Spawn roomPoisoner - upgrqde controller to lvl2, wall in controller then sources.
 */
let RoomPoisonerOverlord = RoomPoisonerOverlord_1 = class RoomPoisonerOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.outpostOffense.roomPoisoner) {
        super(directive, 'PoisonRoom', priority);
        this.roomPoisoners = this.zerg(Roles.roomPoisoner);
    }
    init() {
        // Re-compute the list of positions to block
        if (this.room) {
            const thingsToBlock = _.compact([this.room.controller, ...this.room.sources]);
            const neighborTiles = _.unique(_.flatten(_.map(thingsToBlock, obj => obj.pos.neighbors)), pos => packPos(pos));
            this.blockPositions = _.filter(neighborTiles, pos => pos.isWalkable(true));
        }
        else {
            this.blockPositions = [];
        }
        if (this.room && this.room.dangerousPlayerHostiles.length == 0) {
            this.wishlist(1, Setups.roomPoisoner);
        }
    }
    handleRoomPoisoner(posioner) {
        // Recharge if needed
        if (posioner.carry.energy < BUILD_POWER) {
            posioner.task = Tasks.recharge();
            return;
        }
        // Go to Target Room
        if (!posioner.inSameRoomAs(this)) {
            posioner.goTo(this.pos, { pathOpts: { ensurePath: true, avoidSK: true } });
            return;
        }
        // If you're in the room
        if (this.room && this.room.controller && this.room.controller.my) {
            // Upgrade controller to level 2
            if (this.room.controller.level < 2) {
                posioner.task = Tasks.upgrade(this.room.controller);
                return;
            }
            // Fortify any walls below threshold (can't used cached room.walls here)
            const wallsUncached = this.room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_WALL } });
            const fortifyTarget = _.find(wallsUncached, wall => wall.hits < RoomPoisonerOverlord_1.settings.wallHits);
            if (fortifyTarget) {
                posioner.task = Tasks.fortify(fortifyTarget, RoomPoisonerOverlord_1.settings.wallHits);
                return;
            }
            // Construct walls
            const wallConstructionSite = _.first(this.room.constructionSites);
            if (wallConstructionSite) {
                posioner.task = Tasks.build(wallConstructionSite);
                return;
            }
            // If nothing to do, then move away from possible construction site locations
            posioner.flee(this.blockPositions, {}, { fleeRange: 4 });
        }
    }
    run() {
        this.autoRun(this.roomPoisoners, roomPoisoner => this.handleRoomPoisoner(roomPoisoner));
    }
};
RoomPoisonerOverlord = RoomPoisonerOverlord_1 = __decorate([
    profile
], RoomPoisonerOverlord);
export { RoomPoisonerOverlord };
