var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DistractionOverlord_1;
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { CombatOverlord } from '../CombatOverlord';
/**
 * 5 Move 1 RA creep that avoids all enemies and distracts attackers.
 * Just for fun
 * TODO: Make them prefer swamps when at max hp
 */
let DistractionOverlord = DistractionOverlord_1 = class DistractionOverlord extends CombatOverlord {
    constructor(directive, boosted = false, priority = OverlordPriority.defense.rangedDefense) {
        super(directive, 'distraction', priority, 1);
        this.distractions = this.combatZerg(Roles.rangedDistractor);
    }
    handleDistraction(distraction) {
        if (this.room && this.room.hostiles.length > 0) {
            distraction.autoCombat(this.room.name, false, 5, { preferRamparts: false });
            DistractionOverlord_1.taunt(distraction, this.room.hostiles[0].owner.username);
            const nearbyHostiles = this.room.hostiles.filter(hostile => hostile.pos.getRangeTo(distraction) <= 6);
            if (nearbyHostiles.length > 0) {
                distraction.kite(nearbyHostiles);
            }
        }
    }
    static taunt(distraction, name) {
        const taunts = ['Heylisten!', 'Pssssst', 'So close', '🎣', 'Try harder', 'Get good;)', 'Base ⬆️', '🔜',
            '⚠️Swamp⚠️', 'Follow me!', 'Catch Me!', `Hi ${name || ''}`, '🍑🍑🍑', '🏎️ VROOM'];
        distraction.sayRandom(taunts, true);
    }
    init() {
        // this.reassignIdleCreeps(Roles.ranged); until it's it's own role don't reassign
        const setup = CombatSetups.distractors.ranged;
        this.wishlist(1, setup);
    }
    run() {
        // need to check room exists
        // console.log(`Distraction overlord running in ${this.room.print} with ${this.distractions}!`);
        this.autoRun(this.distractions, distraction => this.handleDistraction(distraction));
    }
};
DistractionOverlord.settings = {
    retreatHitsPercent: 0.85,
    reengageHitsPercent: 0.95,
};
DistractionOverlord = DistractionOverlord_1 = __decorate([
    profile
], DistractionOverlord);
export { DistractionOverlord };
