var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { OutpostDefenseOverlord } from '../../overlords/defense/outpostDefense';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
/**
 * Defend an outpost against an incoming player invasion
 */
let DirectiveOutpostDefense = class DirectiveOutpostDefense extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
        this.overlords.outpostDefense = new OutpostDefenseOverlord(this);
    }
    init() {
        const numHostiles = this.room ? this.room.hostiles.length.toString() : '???';
        this.alert(`Outpost defense (hostiles: ${numHostiles})`, NotifierPriority.High);
    }
    run() {
        if (!this.room || this.room.hostiles.length > 0) {
            this.memory.safeSince = Game.time;
        }
        // If there are no hostiles left in the room and everyone's healed, then remove the flag
        if (this.room && this.room.hostiles.length == 0 &&
            Game.time - this.memory.safeSince > 100) {
            if (_.filter(this.room.creeps, creep => creep.hits < creep.hitsMax).length == 0) {
                this.remove();
            }
        }
    }
};
DirectiveOutpostDefense.directiveName = 'outpostDefense';
DirectiveOutpostDefense.color = COLOR_BLUE;
DirectiveOutpostDefense.secondaryColor = COLOR_RED;
DirectiveOutpostDefense = __decorate([
    profile
], DirectiveOutpostDefense);
export { DirectiveOutpostDefense };
