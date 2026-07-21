var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Pathing } from '../../movement/Pathing';
import { DismantleOverlord } from '../../overlords/situational/dismantler';
import { AttackStructurePriorities } from '../../priorities/priorities_structures';
import { profile } from '../../profiler/decorator';
import { Visualizer } from '../../visuals/Visualizer';
import { Directive } from '../Directive';
/**
 * Register a target to be dismantled by specific dismantlers
 */
let DirectiveModularDismantle = class DirectiveModularDismantle extends Directive {
    constructor(flag, onlyKillRampart = false, additionalTargets) {
        super(flag);
        this.memory.onlyKillRampart = onlyKillRampart || this.flag.name.includes('rampart');
        this.memory.boost = this.memory.boost || this.flag.name.includes('boost');
        if (this.flag.room) {
            if (!this.memory.targetId) {
                const target = this.getTarget();
                this.memory.targetId = target ? target.id : undefined;
            }
            this.memory.additionalTargets = additionalTargets;
            if (!this.memory.numberSpots) {
                const spots = this.getDismantleSpots(this.flag.pos);
                if (spots) {
                    this.memory.numberSpots = spots.length;
                }
            }
        }
    }
    spawnMoarOverlords() {
        this.overlords.dismantle = new DismantleOverlord(this);
    }
    getTarget() {
        if (!this.pos.isVisible) {
            return;
        }
        const targetedStructureTypes = this.memory.onlyKillRampart ? [STRUCTURE_RAMPART] : AttackStructurePriorities;
        const targets = this.pos.lookFor(LOOK_STRUCTURES);
        for (const structureType of targetedStructureTypes) {
            const correctTargets = targets.filter(target => {
                if (target.structureType == structureType) {
                    return target;
                }
                else if (target.structureType == STRUCTURE_INVADER_CORE) {
                    this.memory.attackInsteadOfDismantle = true;
                    return target;
                }
            });
            if (correctTargets.length > 0) {
                return correctTargets[0];
            }
            // for (const structure of targets) {
            // 	if (structure.structureType == structureType) {
            // 		return structure;
            // 	}
            // 	if (structure.structureType == STRUCTURE_INVADER_CORE) {
            // 		this.memory.attackInsteadOfDismantle = true;
            // 		return structure;
            // 	}
            // }
        }
    }
    getDismantleSpots(target) {
        const nearbySpots = target.availableNeighbors(true);
        if (target.room && target.room.creeps.length > 0) {
            const startingCreep = target.room.creeps.filter(creep => creep.my)[0];
            if (!!startingCreep) {
                const obstacles = _.filter(target.room.structures, s => !s.isWalkable);
                return _.filter(nearbySpots, spot => Pathing.isReachable(startingCreep.pos, spot, obstacles));
            }
        }
    }
    init() {
        let hits = '???';
        const target = this.getTarget();
        hits = target ? (target.hits / 1000).toString() + 'K' : hits;
        this.alert(`Dismantling: ${hits}`);
    }
    run() {
        // Remove the directive once structures have been destroyed
        if (this.pos.isVisible && !this.getTarget()) {
            this.remove();
        }
    }
    visuals() {
        Visualizer.marker(this.pos, { color: 'yellow' });
    }
};
DirectiveModularDismantle.directiveName = 'modularDismantle';
DirectiveModularDismantle.color = COLOR_GREY;
DirectiveModularDismantle.secondaryColor = COLOR_CYAN;
DirectiveModularDismantle = __decorate([
    profile
], DirectiveModularDismantle);
export { DirectiveModularDismantle };
