var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * [DEPRECATED] Place a command center at the target location
 */
let DirectiveRPCommandCenter = class DirectiveRPCommandCenter extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
    }
    init() {
        log.info(`Classic overmind layout is deprecated; bunker layout is recommended.`);
        this.colony.roomPlanner.addComponent('commandCenter', this.pos, this.memory.rotation);
    }
    run() {
    }
};
DirectiveRPCommandCenter.directiveName = 'roomPlanner:CommandCenter';
DirectiveRPCommandCenter.color = COLOR_WHITE;
DirectiveRPCommandCenter.secondaryColor = COLOR_BLUE;
DirectiveRPCommandCenter = __decorate([
    profile
], DirectiveRPCommandCenter);
export { DirectiveRPCommandCenter };
