var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { AttackStructurePriorities } from '../../priorities/priorities_structures';
import { profile } from '../../profiler/decorator';
import { Visualizer } from '../../visuals/Visualizer';
import { Directive } from '../Directive';
/**
 * [LEGACY] Manually specify targets to be prioritized during a siege
 */
let DirectiveTargetSiege = class DirectiveTargetSiege extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
    }
    getTarget() {
        const targetedStructures = this.pos.lookFor(LOOK_STRUCTURES);
        for (const structure of targetedStructures) {
            for (const structureType of AttackStructurePriorities) {
                if (structure.structureType == structureType) {
                    return structure;
                }
            }
        }
    }
    init() {
    }
    run() {
        // Remove the directive once structures have been destroyed
        if (this.pos.isVisible && !this.getTarget()) {
            this.remove();
        }
    }
    visuals() {
        Visualizer.marker(this.pos, { color: 'orange' });
    }
};
DirectiveTargetSiege.directiveName = 'target:siege';
DirectiveTargetSiege.color = COLOR_GREY;
DirectiveTargetSiege.secondaryColor = COLOR_ORANGE;
DirectiveTargetSiege = __decorate([
    profile
], DirectiveTargetSiege);
export { DirectiveTargetSiege };
