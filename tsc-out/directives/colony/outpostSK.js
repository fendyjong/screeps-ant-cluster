var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { SourceReaperOverlord } from '../../overlords/mining/sourceKeeperReeper';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Remote mining directive for source keeper rooms
 */
let DirectiveSKOutpost = class DirectiveSKOutpost extends Directive {
    constructor(flag) {
        super(flag, colony => colony.level >= 7);
        this.refresh();
    }
    refresh() {
        super.refresh();
    }
    spawnMoarOverlords() {
        this.overlords.sourceReaper = new SourceReaperOverlord(this);
    }
    init() {
    }
    run() {
    }
};
DirectiveSKOutpost.directiveName = 'outpostSK';
DirectiveSKOutpost.color = COLOR_PURPLE;
DirectiveSKOutpost.secondaryColor = COLOR_YELLOW;
DirectiveSKOutpost = __decorate([
    profile
], DirectiveSKOutpost);
export { DirectiveSKOutpost };
