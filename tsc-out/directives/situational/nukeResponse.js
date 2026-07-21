var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DirectiveNukeResponse_1;
import { log } from '../../console/log';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
/**
 * Nuke response: automatically over-fortify ramparts to withstand an incoming nuclear strike
 */
let DirectiveNukeResponse = DirectiveNukeResponse_1 = class DirectiveNukeResponse extends Directive {
    constructor(flag) {
        super(flag, colony => colony.name == Directive.getPos(flag).roomName
            && colony.level >= DirectiveNukeResponse_1.requiredRCL);
        this.refresh();
    }
    refresh() {
        super.refresh();
        this.nukes = this.room.find(FIND_NUKES);
        if (this.nukes.length > 0) {
            this.colony.state.isBeingNuked = true;
        }
    }
    spawnMoarOverlords() {
    }
    init() {
        for (const nuke of this.nukes) {
            this.alert(`Nuclear impact in ${nuke.timeToLand}`, NotifierPriority.Critical);
        }
    }
    /**
     * Returns whether a position should be reinforced or not
     */
    static shouldReinforceLocation(pos) {
        const dontReinforce = [STRUCTURE_ROAD, STRUCTURE_RAMPART, STRUCTURE_WALL];
        const colony = Overmind.colonies[pos.roomName];
        if (colony && colony.assets.energy < 200000) {
            dontReinforce.push(STRUCTURE_EXTENSION);
        }
        return _.filter(pos.lookFor(LOOK_STRUCTURES), s => !_.contains(dontReinforce, s.structureType)).length > 0;
    }
    run() {
        // Build ramparts at all positions affected by nukes with structures on them
        if (Game.time % 50 == 0) {
            if (this.nukes.length > 0) {
                for (const nuke of this.nukes) {
                    const rampartPositions = _.filter(nuke.pos.getPositionsInRange(2), pos => DirectiveNukeResponse_1.shouldReinforceLocation(pos));
                    for (const pos of rampartPositions) {
                        // Build a rampart if there isn't one already
                        if (!pos.lookForStructure(STRUCTURE_RAMPART)) {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                    log.alert(`Incoming nuke at ${nuke.pos.print}! Time until impact: ${nuke.timeToLand}`);
                }
            }
            else {
                // Remove once nuke is gone
                this.remove();
            }
        }
    }
};
DirectiveNukeResponse.directiveName = 'nukeResponse';
DirectiveNukeResponse.color = COLOR_ORANGE;
DirectiveNukeResponse.secondaryColor = COLOR_BLUE;
DirectiveNukeResponse.requiredRCL = 6;
DirectiveNukeResponse = DirectiveNukeResponse_1 = __decorate([
    profile
], DirectiveNukeResponse);
export { DirectiveNukeResponse };
