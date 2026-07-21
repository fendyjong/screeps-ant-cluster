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
 * Register a target to be dismantled by workers. This is not a siege directive, and clearing rooms should
 * be done with the DirectiveRoomClear
 */
let DirectiveDismantle = class DirectiveDismantle extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
    }
    getTarget() {
        if (!this.pos.isVisible) {
            return;
        }
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
        // Add this structure to worker overlord's dismantle list
        const target = this.getTarget();
        if (target && !this.colony.overlords.work.dismantleStructures.includes(target)) {
            this.colony.overlords.work.dismantleStructures.push(target);
        }
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
DirectiveDismantle.directiveName = 'dismantle';
DirectiveDismantle.color = COLOR_GREY;
DirectiveDismantle.secondaryColor = COLOR_YELLOW;
DirectiveDismantle = __decorate([
    profile
], DirectiveDismantle);
export { DirectiveDismantle };
