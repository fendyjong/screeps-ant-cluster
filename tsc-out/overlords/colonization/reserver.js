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
import { MY_USERNAME } from '../../~settings';
import { Overlord } from '../Overlord';
/**
 * Spawns reservers to reserve an outpost room
 */
let ReservingOverlord = class ReservingOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.remoteRoom.reserve) {
        super(directive, 'reserve', priority);
        // Change priority to operate per-outpost
        this.priority += this.outpostIndex * OverlordPriority.remoteRoom.roomIncrement;
        this.reserveBuffer = 2000;
        this.reservers = this.zerg(Roles.claim);
    }
    init() {
        let amount = 0;
        if (this.room) {
            if (this.room.controller.needsReserving(this.reserveBuffer)) {
                amount = 1;
            }
            else if (this.room.controller.reservation && !this.room.controller.reservedByMe) {
                amount = Math.min(this.room.controller.pos.availableNeighbors(true).length, 2);
            }
        }
        else if (RoomIntel.roomReservedBy(this.pos.roomName) == MY_USERNAME &&
            RoomIntel.roomReservationRemaining(this.pos.roomName) < 1000) {
            amount = 1;
        }
        this.wishlist(amount, Setups.infestors.reserve);
    }
    handleReserver(reserver) {
        if (reserver.avoidDanger())
            return;
        if (reserver.room == this.room && !reserver.pos.isEdge) {
            // If reserver is in the room and not on exit tile
            if (!this.room.controller.signedByMe) {
                // Takes care of an edge case where planned newbie zone signs prevents signing until room is reserved
                if (!this.room.my && this.room.controller.signedByScreeps) {
                    reserver.task = Tasks.reserve(this.room.controller);
                }
                else {
                    reserver.task = Tasks.signController(this.room.controller);
                }
            }
            else {
                reserver.task = Tasks.reserve(this.room.controller);
            }
        }
        else {
            // reserver.task = Tasks.goTo(this.pos);
            reserver.goTo(this.pos);
        }
    }
    run() {
        this.autoRun(this.reservers, reserver => this.handleReserver(reserver));
    }
};
ReservingOverlord = __decorate([
    profile
], ReservingOverlord);
export { ReservingOverlord };
