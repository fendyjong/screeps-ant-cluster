var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { SpawnGroup } from '../logistics/SpawnGroup';
import { profile } from '../profiler/decorator';
import { Overlord } from './Overlord';
const getDefaultCombatOverlordMemory = () => ({
    ["T" /* MEM.TICK */]: Game.time,
});
/**
 * CombatOverlords extend the base Overlord class to provide additional combat-specific behavior
 */
let CombatOverlord = class CombatOverlord extends Overlord {
    constructor(directive, name, priority, requiredRCL, maxPathDistance) {
        super(directive, name, priority, getDefaultCombatOverlordMemory);
        this.directive = directive;
        this.requiredRCL = requiredRCL;
        this.spawnGroup = new SpawnGroup(this, { requiredRCL: this.requiredRCL, maxPathDistance: maxPathDistance });
    }
    get age() {
        return Game.time - this.memory["T" /* MEM.TICK */];
    }
    // Standard sequence of actions for running combat creeps
    autoRun(roleCreeps, creepHandler) {
        for (const creep of roleCreeps) {
            if (creep.spawning) {
                return;
            }
            if (creep.hasValidTask) {
                creep.run();
            }
            else {
                if (creep.needsBoosts) {
                    this.handleBoosting(creep);
                }
                else {
                    creepHandler(creep);
                }
            }
        }
    }
    /**
     * Contains logic for shutting down the overlord
     */
    finish(successful) {
        for (const zerg of this.getAllZerg()) {
            zerg.reassign(this.colony.overlords.default);
        }
        // TODO: CombatOverlord
    }
};
CombatOverlord = __decorate([
    profile
], CombatOverlord);
export { CombatOverlord };
