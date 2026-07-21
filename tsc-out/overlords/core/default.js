var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { getOverlord } from '../../zerg/AnyZerg';
import { Zerg } from '../../zerg/Zerg';
import { Overlord } from '../Overlord';
/**
 * This overlord contains the default actions for any creeps which lack an overlord (for example, miners whose
 * miningSite is no longer visible, or guards with no directive)
 */
let DefaultOverlord = class DefaultOverlord extends Overlord {
    constructor(colony) {
        super(colony, 'default', OverlordPriority.default);
        this.idleZerg = [];
    }
    init() {
        // Zergs are collected at end of init phase; by now anything needing to be claimed already has been
        const idleCreeps = _.filter(this.colony.creeps, creep => !getOverlord(creep));
        this.idleZerg = _.map(idleCreeps, creep => Overmind.zerg[creep.name] || new Zerg(creep));
        for (const zerg of this.idleZerg) {
            zerg.refresh();
        }
    }
    run() {
    }
};
DefaultOverlord = __decorate([
    profile
], DefaultOverlord);
export { DefaultOverlord };
