var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { Roles } from '../../creepSetups/setups';
import { BootstrappingOverlord } from '../../overlords/situational/bootstrap';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
/**
 * Bootstrapping directive: recover from a colony-wide crash or bootstrap from initial spawn-in
 */
let DirectiveBootstrap = class DirectiveBootstrap extends Directive {
    constructor(flag) {
        super(flag);
        this.refresh(); // data needs to be recomputed each tick
    }
    refresh() {
        super.refresh();
        this.colony.state.bootstrapping = true;
        this.needsMiner = (this.colony.getCreepsByRole(Roles.drone).length == 0);
        this.needsManager = (this.colony.commandCenter != undefined &&
            this.colony.commandCenter.overlord != undefined &&
            this.colony.commandCenter.link != undefined &&
            this.colony.getCreepsByRole(Roles.manager).length == 0);
        this.needsQueen = (this.colony.getCreepsByRole(Roles.queen).length == 0);
    }
    spawnMoarOverlords() {
        this.overlords.bootstrap = new BootstrappingOverlord(this);
    }
    init() {
        this.alert(`Colony in bootstrap mode!`, NotifierPriority.High);
        if (Game.time % 100 == 0) {
            log.alert(`Colony ${this.room.print} is in emergency recovery mode.`);
        }
    }
    run() {
        if (!this.needsQueen && !this.needsMiner) {
            if (this.colony.storage && this.colony.assets.energy < 5000) {
                return; // wait a little while at higher levels before stopping bootstrapping
            }
            log.alert(`Colony ${this.room.print} has recovered from crash; removing bootstrap directive.`);
            // Suicide any fillers so they don't get in the way
            const overlord = this.overlords.bootstrap;
            for (const filler of overlord.fillers) {
                filler.suicide();
            }
            // Remove the directive
            this.remove();
        }
    }
};
DirectiveBootstrap.directiveName = 'bootstrap';
DirectiveBootstrap.color = COLOR_ORANGE;
DirectiveBootstrap.secondaryColor = COLOR_ORANGE;
DirectiveBootstrap = __decorate([
    profile
], DirectiveBootstrap);
export { DirectiveBootstrap };
