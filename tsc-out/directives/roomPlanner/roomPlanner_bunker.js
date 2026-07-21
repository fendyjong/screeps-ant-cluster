var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { bunkerLayout } from '../../roomPlanner/layouts/bunker';
import { Visualizer } from '../../visuals/Visualizer';
import { Directive } from '../Directive';
/**
 * Manually place a bunker anchored at the target location for the RoomPlanner to use in semiautomatic or manual mode
 */
let DirectiveRPBunker = class DirectiveRPBunker extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
    }
    init() {
        this.colony.roomPlanner.addComponent('bunker', this.pos, this.memory.rotation);
    }
    run() {
    }
    visuals() {
        Visualizer.drawLayout(bunkerLayout, this.pos);
    }
};
DirectiveRPBunker.directiveName = 'roomPlanner:CommandCenter';
DirectiveRPBunker.color = COLOR_WHITE;
DirectiveRPBunker.secondaryColor = COLOR_RED;
DirectiveRPBunker = __decorate([
    profile
], DirectiveRPBunker);
export { DirectiveRPBunker };
