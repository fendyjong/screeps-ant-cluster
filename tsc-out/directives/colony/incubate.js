var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { SpawnGroup } from '../../logistics/SpawnGroup';
import { ClaimingOverlord } from '../../overlords/colonization/claimer';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Claims a new room and incubates it from the nearest (or specified) colony
 */
let DirectiveIncubate = class DirectiveIncubate extends Directive {
    constructor(flag) {
        super(flag, colony => colony.level >= 7);
        // Register incubation status
        this.incubatee = this.room ? Overmind.colonies[Overmind.colonyMap[this.room.name]] : undefined;
        this.refresh();
    }
    refresh() {
        if (this.incubatee) {
            this.incubatee.state.isIncubating = true;
            this.incubatee.spawnGroup = new SpawnGroup(this.incubatee);
        }
    }
    spawnMoarOverlords() {
        if (!this.incubatee) { // colony isn't claimed yet
            this.overlords.claim = new ClaimingOverlord(this);
        }
    }
    init() {
    }
    run() {
        if (this.incubatee) {
            if (this.incubatee.level >= 7 && this.incubatee.storage && this.incubatee.terminal) {
                this.remove();
            }
        }
    }
};
DirectiveIncubate.directiveName = 'incubate';
DirectiveIncubate.color = COLOR_PURPLE;
DirectiveIncubate.secondaryColor = COLOR_WHITE;
DirectiveIncubate = __decorate([
    profile
], DirectiveIncubate);
export { DirectiveIncubate };
