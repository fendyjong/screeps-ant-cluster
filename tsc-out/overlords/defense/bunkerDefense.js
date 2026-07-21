var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { CombatOverlord } from '../CombatOverlord';
/**
 * Spawns bunker-only defenders to defend against incoming sieges // TODO: needs some revision
 */
let BunkerDefenseOverlord = class BunkerDefenseOverlord extends CombatOverlord {
    constructor(directive, priority = OverlordPriority.defense.meleeDefense) {
        // Only spawn inside room
        super(directive, 'bunkerDefense', priority, 1, 30);
        this.defenders = this.combatZerg(Roles.bunkerDefender);
    }
    handleDefender(lurker) {
        if (!lurker.inRampart) {
            const nearbyRampart = _.find(lurker.room.walkableRamparts, rampart => rampart.pos.getRangeTo(lurker) < 5);
            if (nearbyRampart) {
                lurker.goTo(nearbyRampart);
            }
        }
        if (lurker.room.hostiles.length > 0) {
            lurker.autoBunkerCombat(lurker.room.name);
        }
        else {
            // go out of way in bunker
        }
    }
    init() {
        this.reassignIdleCreeps(Roles.bunkerDefender);
        this.wishlist(1, CombatSetups.bunkerDefender.boosted);
    }
    run() {
        this.autoRun(this.defenders, defender => this.handleDefender(defender));
    }
};
BunkerDefenseOverlord.settings = {
    retreatHitsPercent: 0.85,
    reengageHitsPercent: 0.95,
};
BunkerDefenseOverlord = __decorate([
    profile
], BunkerDefenseOverlord);
export { BunkerDefenseOverlord };
