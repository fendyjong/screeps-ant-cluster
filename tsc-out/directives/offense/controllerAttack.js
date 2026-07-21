var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { ControllerAttackerOverlord } from '../../overlords/offense/controllerAttacker';
import { StationaryScoutOverlord } from '../../overlords/scouting/stationary';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Attack a controller, downgrading it to level 0
 */
let DirectiveControllerAttack = class DirectiveControllerAttack extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
        this.overlords.scout = new StationaryScoutOverlord(this); // TODO: Not have a scout at all times
        this.overlords.controllerAttack = new ControllerAttackerOverlord(this);
    }
    init() {
        const level = this.room && this.room.controller ? this.room.controller.level.toString() : '???';
        this.alert(`Downgrading controller (RCL${level})`);
    }
    run() {
        if (this.room && this.room.controller && (this.room.controller.level == 0 && (!this.room.controller.reservation
            || this.room.controller.reservation.ticksToEnd < 5))) {
            log.notify(`Removing ${this.name} since controller has reached level 0.`);
            this.remove();
        }
    }
};
DirectiveControllerAttack.directiveName = 'controllerAttack';
DirectiveControllerAttack.color = COLOR_RED;
DirectiveControllerAttack.secondaryColor = COLOR_PURPLE;
DirectiveControllerAttack = __decorate([
    profile
], DirectiveControllerAttack);
export { DirectiveControllerAttack };
