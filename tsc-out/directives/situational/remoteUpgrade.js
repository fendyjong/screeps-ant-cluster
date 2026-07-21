var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DirectiveRemoteUpgrade_1;
import { RemoteUpgradingOverlord } from '../../overlords/situational/remoteUpgrader';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Spawns remote upgraders and energy carriers to travel to a distant room to upgrade the controller. The directive
 * should be placed on the controller in the child room and should only be used after the room has been claimed.
 */
let DirectiveRemoteUpgrade = DirectiveRemoteUpgrade_1 = class DirectiveRemoteUpgrade extends Directive {
    constructor(flag) {
        flag.memory.allowPortals = true;
        super(flag, (colony) => colony.level >= DirectiveRemoteUpgrade_1.requiredRCL);
    }
    spawnMoarOverlords() {
        this.overlords.remoteUpgrade = new RemoteUpgradingOverlord(this);
    }
    init() {
        this.alert(`Remote upgrade active`);
    }
    run() {
        if (this.room && this.room.controller && this.room.controller.level == 8) {
            this.remove();
        }
    }
};
DirectiveRemoteUpgrade.directiveName = 'remoteUpgrade';
DirectiveRemoteUpgrade.color = COLOR_ORANGE;
DirectiveRemoteUpgrade.secondaryColor = COLOR_YELLOW;
DirectiveRemoteUpgrade.requiredRCL = 8;
DirectiveRemoteUpgrade = DirectiveRemoteUpgrade_1 = __decorate([
    profile
], DirectiveRemoteUpgrade);
export { DirectiveRemoteUpgrade };
