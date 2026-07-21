var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { RoomIntel } from '../../intel/RoomIntel';
import { HarassOverlord } from '../../overlords/offense/harass';
import { profile } from '../../profiler/decorator';
import { MY_USERNAME } from '../../~settings';
import { Directive } from '../Directive';
/**
 * Harass Directive that wanders through enemy rooms killing stuff
 * Placed on an enemy room, it will harass all of it's remotes periodically
 */
let DirectiveHarass = class DirectiveHarass extends Directive {
    constructor(flag) {
        super(flag);
        this.memory.targetPlayer = RoomIntel.roomOwnedBy(flag.pos.roomName);
        this.memory.nextSpawnTime = Game.time;
        if (this.memory.targetPlayer == MY_USERNAME) {
            log.error(`Ahhhhhh harassing self in room ${flag.pos.roomName}`);
            this.remove();
        }
        else {
            log.alert(`Starting harass on ${flag.pos.roomName} owned by ${this.memory.targetPlayer}`);
        }
        if (this.memory.targetPlayer) {
            this.memory.roomsToHarass = this.findNearbyReservedRooms(flag.pos.roomName, this.memory.targetPlayer);
        }
    }
    spawnMoarOverlords() {
        // For now, just spawn from RCL 5+ rooms
        this.overlords.harassOverlord = new HarassOverlord(this);
    }
    init() {
        // if
        // if (!this.memory.roomsToHarass && this.memory.targetPlayer)
    }
    findNearbyReservedRoomsForHarassment() {
        if (this.memory.targetPlayer) {
            return this.findNearbyReservedRooms(this.flag.pos.roomName, this.memory.targetPlayer);
        }
        return [];
    }
    /**
     * Finds the rooms to harass
     *
     * @param roomName
     * @param playerName
     */
    findNearbyReservedRooms(roomName, playerName) {
        if (!this.memory.targetPlayer) {
            log.error(`Unable to find which player to harass in room ${roomName}`);
            return [];
        }
        const whitelist = Memory.settings.allies;
        const reservedByTargetPlayer = [];
        const adjacentRooms = _.values(Game.map.describeExits(roomName));
        adjacentRooms.forEach(room => {
            const reservation = RoomIntel.roomReservedBy(room);
            console.log('Checking for harass in room ' + room);
            if (reservation && this.memory.aggressive ? !whitelist.includes(reservation) : reservation == playerName) {
                reservedByTargetPlayer.push(room);
                // TODO This will double add rooms next to owned rooms, making it more likely to harass them, reconsider
                _.values(Game.map.describeExits(room)).forEach(room => {
                    if (RoomIntel.roomReservedBy(room) == playerName) {
                        reservedByTargetPlayer.push(room);
                    }
                });
            }
        });
        Game.notify(`Looking for nearby rooms to harass, found ${reservedByTargetPlayer}`);
        return reservedByTargetPlayer;
    }
    run() {
        // Probably something modifying frequency of harassment
    }
};
DirectiveHarass.directiveName = 'harass';
DirectiveHarass.color = COLOR_RED;
DirectiveHarass.secondaryColor = COLOR_WHITE;
DirectiveHarass = __decorate([
    profile
], DirectiveHarass);
export { DirectiveHarass };
