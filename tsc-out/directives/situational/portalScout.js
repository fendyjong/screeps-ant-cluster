var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { PortalScoutOverlord } from '../../overlords/scouting/portalWalker';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * It's like the movie Interstellar, but the special effects budget is whatever cash I left in my jeans
 */
let DirectivePortalScout = class DirectivePortalScout extends Directive {
    constructor(flag, colonyFilter) {
        flag.memory.allowPortals = true;
        super(flag, colonyFilter);
    }
    spawnMoarOverlords() {
        this.overlords.portalScoutOverlord = new PortalScoutOverlord(this);
    }
    init() {
        this.alert(`Portal scout active`);
    }
    run() {
    }
};
DirectivePortalScout.directiveName = 'portalScout';
DirectivePortalScout.color = COLOR_ORANGE;
DirectivePortalScout.secondaryColor = COLOR_WHITE;
DirectivePortalScout.requiredRCL = 3;
DirectivePortalScout = __decorate([
    profile
], DirectivePortalScout);
export { DirectivePortalScout };
