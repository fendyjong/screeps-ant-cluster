var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
const getDefaultEmptyOverlordMemory = () => ({});
/**
 * DOCUMENTATION GOES HERE
 */
let EmptyOverlord = class EmptyOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.default) {
        super(directive, 'empty', priority, getDefaultEmptyOverlordMemory);
        // TODO
        this.role1 = this.zerg('ROLES.SOMETHING'); // TODO
    }
    refresh() {
        super.refresh();
        // TODO
    }
    init() {
        this.wishlist(1, Setups.upgraders.default);
    }
    handleUpgrader(zerg) {
        // TODO
    }
    run() {
        this.autoRun(this.role1, zerg => this.handleUpgrader(zerg));
    }
};
EmptyOverlord = __decorate([
    profile
], EmptyOverlord);
export { EmptyOverlord };
