var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var HarassOverlord_1;
import { log } from '../../console/log';
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { CombatOverlord } from '../CombatOverlord';
/**
 * Spawns ranged harassers to stop mining for an enemy room
 */
let HarassOverlord = HarassOverlord_1 = class HarassOverlord extends CombatOverlord {
    constructor(directive, priority = OverlordPriority.outpostOffense.harass) {
        super(directive, 'harass', priority, 1);
        this.directive = directive;
        this.nibblers = this.combatZerg(Roles.melee);
        this.hydralisks = this.combatZerg(Roles.ranged);
    }
    handleHarass(hydralisk) {
        hydralisk.autoCombat(this.targetRemoteToHarass || hydralisk.room.name);
        // this.chooseRemoteToHarass(hydralisk, hydralisk.room.name);
        if (!this.targetRemoteToHarass) {
            this.chooseRemoteToHarass(hydralisk, hydralisk.room.name);
        }
        if (this.targetRemoteToHarass && hydralisk.room.name != this.targetRemoteToHarass) {
            hydralisk.goToRoom(this.targetRemoteToHarass);
        }
        else if (hydralisk.room.dangerousHostiles.length > 2) {
            // Time to move on
            // Track when defense spawned
            hydralisk.room.dangerousHostiles.forEach(hostile => {
                const nextSafeSpawn = (Game.time - HarassOverlord_1.settings.prespawn + (hostile.ticksToLive || 0));
                if (nextSafeSpawn > this.directive.memory.nextSpawnTime) {
                    this.directive.memory.nextSpawnTime = nextSafeSpawn;
                }
            });
            if (hydralisk.room.name != this.targetRemoteToHarass) {
                hydralisk.goToRoom(this.targetRemoteToHarass);
            }
            else {
                const nextRoom = this.chooseRemoteToHarass(hydralisk, hydralisk.room.name);
                if (nextRoom) {
                    hydralisk.goToRoom(this.targetRemoteToHarass);
                }
            }
        }
        // Clean up construction sites then move on to another room
    }
    chooseRemoteToHarass(hydralisk, currentRoom) {
        if (!this.directive.memory.roomsToHarass || this.directive.memory.roomsToHarass.length == 0) {
            this.directive.memory.roomsToHarass = this.directive.findNearbyReservedRoomsForHarassment();
        }
        const nextRoom = this.directive.memory.roomsToHarass.shift();
        if (nextRoom) {
            this.directive.memory.roomsToHarass.push(nextRoom);
            this.targetRemoteToHarass = nextRoom;
            log.debug(`Selecting new target of ${this.targetRemoteToHarass} for ${hydralisk.print} from ` +
                `${this.directive.memory.roomsToHarass}`);
            hydralisk.say(`Tgt ${this.targetRemoteToHarass}`);
            return nextRoom;
        }
    }
    init() {
        this.reassignIdleCreeps(Roles.ranged);
        this.reassignIdleCreeps(Roles.melee);
        const setup = CombatSetups.hydralisks.default;
        const numtoSpawn = (!this.directive.memory.nextSpawnTime || Game.time >= this.directive.memory.nextSpawnTime) ? 1 : 0;
        this.wishlist(numtoSpawn, setup);
    }
    run() {
        this.autoRun(this.hydralisks, hydralisk => this.handleHarass(hydralisk));
        this.autoRun(this.nibblers, hydralisk => this.handleHarass(hydralisk));
    }
};
HarassOverlord.settings = {
    retreatHitsPercent: 0.85,
    reengageHitsPercent: 0.95,
    prespawn: 200,
};
HarassOverlord = HarassOverlord_1 = __decorate([
    profile
], HarassOverlord);
export { HarassOverlord };
