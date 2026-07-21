var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Launches nuke at target location
 */
let DirectiveNukeTarget = class DirectiveNukeTarget extends Directive {
    // TODO add sending multiple nukes and spacing the nukes out by x amount
    constructor(flag) {
        super(flag, (colony) => !!colony.nuker && !(colony.nuker.cooldown > 0)
            && Game.map.getRoomLinearDistance(colony.room.name, flag.pos.roomName) <= 10);
        this.refresh();
    }
    refresh() {
        super.refresh();
    }
    spawnMoarOverlords() {
    }
    init() {
    }
    run() {
        if (this.colony.nuker && this.colony.nuker.cooldown == 0) {
            const res = this.colony.nuker.launchNuke(this.flag.pos);
            if (res == OK) {
                log.notify(`Launching nuclear strike at ${this.flag.pos.print}, ETA ${Game.time + NUKE_LAND_TIME}`);
                this.remove();
            }
        }
        else if (!this.colony.nuker || this.colony.nuker.cooldown > 0) {
            log.error(`DirectiveNuke unable to fire from ${this.colony.name} due to nuker ${this.colony.nuker} ` +
                `being unavailable: ${this.print}`);
            this.remove();
        }
    }
};
DirectiveNukeTarget.directiveName = 'nukeTarget';
DirectiveNukeTarget.color = COLOR_ORANGE;
DirectiveNukeTarget.secondaryColor = COLOR_RED;
DirectiveNukeTarget.requiredRCL = 8;
DirectiveNukeTarget = __decorate([
    profile
], DirectiveNukeTarget);
export { DirectiveNukeTarget };
