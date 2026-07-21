var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DirectiveColonize_1;
import { log } from '../../console/log';
import { Roles } from '../../creepSetups/setups';
import { ClaimingOverlord } from '../../overlords/colonization/claimer';
import { PioneerOverlord } from '../../overlords/colonization/pioneer';
import { profile } from '../../profiler/decorator';
import { Cartographer, ROOMTYPE_CONTROLLER } from '../../utilities/Cartographer';
import { printRoomName } from '../../utilities/utils';
import { MY_USERNAME } from '../../~settings';
import { Directive } from '../Directive';
/**
 * Claims a new room and builds a spawn but does not incubate. Removes when spawn is constructed.
 */
let DirectiveColonize = DirectiveColonize_1 = class DirectiveColonize extends Directive {
    constructor(flag) {
        flag.memory.allowPortals = true;
        super(flag, colony => colony.level >= DirectiveColonize_1.requiredRCL
            && colony.name != Directive.getPos(flag).roomName && colony.spawns.length > 0);
        // Register incubation status
        this.toColonize = this.room ? Overmind.colonies[Overmind.colonyMap[this.room.name]] : undefined;
        // Remove if misplaced
        if (Cartographer.roomType(this.pos.roomName) != ROOMTYPE_CONTROLLER) {
            log.warning(`${this.print}: ${printRoomName(this.pos.roomName)} is not a controller room; ` +
                `removing directive!`);
            this.remove(true);
            return;
        }
    }
    spawnMoarOverlords() {
        this.overlords.claim = new ClaimingOverlord(this);
        this.overlords.pioneer = new PioneerOverlord(this);
    }
    init() {
        this.alert(`Colonization in progress`);
    }
    run(verbose = false) {
        // TODO bug where can't claim a reservation room -> this.flag.pos.roomName == this.toColonize.name
        if (this.toColonize && this.toColonize.spawns.length > 0) {
            // Reassign all pioneers to be miners and workers
            const miningOverlords = _.map(this.toColonize.miningSites, site => site.overlords.mine);
            for (const pioneer of this.overlords.pioneer.pioneers) {
                const miningOverlord = miningOverlords.shift();
                if (miningOverlord) {
                    if (verbose) {
                        log.debug(`Reassigning: ${pioneer.print} to mine: ${miningOverlord.print}`);
                    }
                    pioneer.reassign(miningOverlord, Roles.drone);
                }
                else {
                    if (verbose) {
                        log.debug(`Reassigning: ${pioneer.print} to work: ${this.toColonize.overlords.work.print}`);
                    }
                    pioneer.reassign(this.toColonize.overlords.work, Roles.worker);
                }
            }
            // Remove the directive
            this.remove();
        }
        if (Game.time % 10 == 2 && this.room && !!this.room.owner && this.room.owner != MY_USERNAME) {
            log.notify(`Removing Colonize directive in ${this.pos.roomName}: room already owned by another player.`);
            this.remove();
        }
    }
};
DirectiveColonize.directiveName = 'colonize';
DirectiveColonize.color = COLOR_PURPLE;
DirectiveColonize.secondaryColor = COLOR_GREY;
DirectiveColonize.requiredRCL = 3;
DirectiveColonize = DirectiveColonize_1 = __decorate([
    profile
], DirectiveColonize);
export { DirectiveColonize };
