var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Roles, Setups } from '../../creepSetups/setups';
import { RoomIntel } from '../../intel/RoomIntel';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Tasks } from '../../tasks/Tasks';
import { Overlord } from '../Overlord';
const DEFAULT_NUM_SCOUTS = 3;
/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */
let RandomWalkerScoutOverlord = class RandomWalkerScoutOverlord extends Overlord {
    constructor(colony, priority = OverlordPriority.scouting.randomWalker) {
        super(colony, 'scout', priority);
        this.scouts = this.zerg(Roles.scout, { notifyWhenAttacked: false });
    }
    init() {
        this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
    }
    handleScout(scout) {
        // // Stomp on enemy construction sites
        // const enemyConstructionSites = scout.room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
        // if (enemyConstructionSites.length > 0 && enemyConstructionSites[0].pos.isWalkable(true)) {
        // 	scout.goTo(enemyConstructionSites[0].pos);
        // 	return;
        // }
        // Check if room might be connected to newbie/respawn zone
        const indestructibleWalls = _.filter(scout.room.walls, wall => wall.hits == undefined);
        if (indestructibleWalls.length > 0) { // go back to origin colony if you find a room near newbie zone
            scout.task = Tasks.goToRoom(this.colony.room.name); // todo: make this more precise
        }
        else {
            // Pick a new room
            const neighboringRooms = _.values(Game.map.describeExits(scout.pos.roomName));
            const roomName = _.sample(neighboringRooms);
            if (RoomIntel.isRoomAccessible(roomName)) {
                scout.task = Tasks.goToRoom(roomName);
            }
        }
    }
    run() {
        this.autoRun(this.scouts, scout => this.handleScout(scout));
    }
};
RandomWalkerScoutOverlord = __decorate([
    profile
], RandomWalkerScoutOverlord);
export { RandomWalkerScoutOverlord };
