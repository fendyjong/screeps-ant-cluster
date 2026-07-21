var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { CombatSetups, Roles } from '../../creepSetups/setups';
import { CombatIntel } from '../../intel/CombatIntel';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { CombatOverlord } from '../CombatOverlord';
/**
 * Spawns ranged defenders to defend against incoming player invasions in an owned room
 */
let RangedDefenseOverlord = class RangedDefenseOverlord extends CombatOverlord {
    constructor(directive, priority = OverlordPriority.defense.rangedDefense) {
        super(directive, 'rangedDefense', priority, 1);
        this.hydralisks = this.combatZerg(Roles.ranged);
    }
    handleDefender(hydralisk) {
        if (this.room.hostiles.length > 0) {
            hydralisk.autoCombat(this.room.name);
        }
        else {
            if (!hydralisk.doMedicActions(this.room.name) && hydralisk.pos.getRangeTo(this.directive.pos) > 4) {
                hydralisk.goTo(this.directive.pos);
            }
        }
    }
    /**
     * Computes how much *additional* ranged parts we need
     */
    computeNeededAdditionalRangedPotential() {
        const healAmount = CombatIntel.maxHealingByCreeps(this.room.hostiles);
        const towerDamage = this.room.hostiles[0] ? CombatIntel.towerDamageAtPos(this.room.hostiles[0].pos) || 0 : 0;
        const worstDamageMultiplier = _.min(_.map(this.room.hostiles, creep => CombatIntel.minimumDamageTakenMultiplier(creep)));
        const hydraliskDamage = RANGED_ATTACK_POWER * CombatIntel.getMyCombatPotentials(this.hydralisks).ranged;
        const maxDamageReceived = worstDamageMultiplier * (hydraliskDamage + towerDamage + 1);
        const needAdditionalDamage = Math.max(healAmount - maxDamageReceived, 0);
        const neededRangedParts = needAdditionalDamage / RANGED_ATTACK_POWER;
        return neededRangedParts;
    }
    init() {
        if (this.reassignIdleCreeps(Roles.ranged, 1))
            return;
        let setup = CombatSetups.hydralisks.default;
        if (_.all(this.spawnGroup.colonies, col => col.room.energyCapacityAvailable < 800)) {
            setup = CombatSetups.hydralisks.noHeal; // can't spawn default hydras at very low rcl
        }
        else {
            const { attack, ranged, heal } = CombatIntel.getCombatPotentials(this.room.hostiles);
            // if there's a lot of big baddies or this assault has lasted a long time, pull out the boosts
            if (attack + ranged + heal > 100 || this.age > 1000) {
                setup = CombatSetups.hydralisks.boosted.default;
            }
        }
        const neededAdditionalRangedPotential = this.computeNeededAdditionalRangedPotential();
        if (neededAdditionalRangedPotential) {
            this.requestCreep(setup);
        }
    }
    run() {
        this.autoRun(this.hydralisks, hydralisk => this.handleDefender(hydralisk));
    }
};
RangedDefenseOverlord.settings = {
    retreatHitsPercent: 0.85,
    reengageHitsPercent: 0.95,
};
RangedDefenseOverlord = __decorate([
    profile
], RangedDefenseOverlord);
export { RangedDefenseOverlord };
