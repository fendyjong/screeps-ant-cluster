var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Roles, Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
const DEFAULT_NUM_SCOUTS = 2;
/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */
let PortalScoutOverlord = class PortalScoutOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.scouting.randomWalker) {
        super(directive, 'scout', priority);
        this.directive = directive;
        this.scouts = this.zerg(Roles.scout, { notifyWhenAttacked: false });
    }
    init() {
        this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
    }
    portalSays(creep, isPublic) {
        const says = ['One small', 'step for', `${creep.name}`, `one giant`, `leap for`, `all`, `Creepkind`];
        creep.say(says[Game.time % says.length], isPublic);
    }
    handleScout(scout) {
        const finalDestination = this.directive;
        // log.alert(`Portal walker ${scout.print} is in ${scout.room.name}`);
        if (scout.pos != finalDestination.pos) {
            scout.goTo(finalDestination, { pathOpts: { avoidSK: true } });
        }
        this.portalSays(scout, true);
    }
    run() {
        this.autoRun(this.scouts, scout => this.handleScout(scout));
    }
};
PortalScoutOverlord = __decorate([
    profile
], PortalScoutOverlord);
export { PortalScoutOverlord };
