var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DirectiveOutpost_1;
import { log } from '../../console/log';
import { RoomIntel } from '../../intel/RoomIntel';
import { ReservingOverlord } from '../../overlords/colonization/reserver';
import { StationaryScoutOverlord } from '../../overlords/scouting/stationary';
import { profile } from '../../profiler/decorator';
import { Cartographer, ROOMTYPE_CONTROLLER } from '../../utilities/Cartographer';
import { Directive } from '../Directive';
/**
 * Registers an unowned mining outpost for a nearby colony
 */
let DirectiveOutpost = DirectiveOutpost_1 = class DirectiveOutpost extends Directive {
    spawnMoarOverlords() {
        if (this.colony.level >= DirectiveOutpost_1.settings.canSpawnReserversAtRCL) {
            if (Cartographer.roomType(this.pos.roomName) == ROOMTYPE_CONTROLLER) {
                this.overlords.reserve = new ReservingOverlord(this);
            }
        }
        else {
            this.overlords.scout = new StationaryScoutOverlord(this);
        }
    }
    init() {
    }
    run() {
        if (RoomIntel.roomOwnedBy(this.pos.roomName)) {
            log.warning(`Removing ${this.print} since room is owned!`);
            this.remove();
        }
        if (Game.time % 10 == 3 && this.room && this.room.controller
            && !this.pos.isEqualTo(this.room.controller.pos) && !this.memory.setPos) {
            this.setPosition(this.room.controller.pos);
        }
    }
};
DirectiveOutpost.directiveName = 'outpost';
DirectiveOutpost.color = COLOR_PURPLE;
DirectiveOutpost.secondaryColor = COLOR_PURPLE;
DirectiveOutpost.settings = {
    canSpawnReserversAtRCL: 3,
};
DirectiveOutpost = DirectiveOutpost_1 = __decorate([
    profile
], DirectiveOutpost);
export { DirectiveOutpost };
