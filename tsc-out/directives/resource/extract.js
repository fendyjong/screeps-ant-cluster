var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { ExtractorOverlord } from '../../overlords/mining/extractor';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Mineral extraction directive. Spawns extraction creeps to operate extractors in owned or source keeper rooms
 */
let DirectiveExtract = class DirectiveExtract extends Directive {
    constructor(flag) {
        super(flag);
        if (this.colony) {
            this.colony.destinations.push({ pos: this.pos, order: this.memory["T" /* MEM.TICK */] || Game.time });
        }
    }
    spawnMoarOverlords() {
        let priority;
        if (this.room && this.room.my) {
            if (this.colony.level == 8) {
                priority = OverlordPriority.ownedRoom.mineralRCL8;
            }
            else {
                priority = OverlordPriority.ownedRoom.mineral;
            }
        }
        else {
            priority = OverlordPriority.remoteSKRoom.mineral;
        }
        this.overlords.extract = new ExtractorOverlord(this, priority);
    }
    init() {
    }
    run() {
        if (this.colony.level < 6) {
            log.notify(`Removing extraction directive in ${this.pos.roomName}: room RCL insufficient.`);
            this.remove();
        }
        else if (!this.colony.terminal) {
            log.notify(`Removing extraction directive in ${this.pos.roomName}: room is missing terminal.`);
            this.remove();
        }
    }
};
DirectiveExtract.directiveName = 'extract';
DirectiveExtract.color = COLOR_YELLOW;
DirectiveExtract.secondaryColor = COLOR_CYAN;
DirectiveExtract = __decorate([
    profile
], DirectiveExtract);
export { DirectiveExtract };
