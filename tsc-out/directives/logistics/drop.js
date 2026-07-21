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
 * Dropping directive - at early levels transporters should pick up from drops and put them all in a giant pile
 * near the storage position and upgrading position
 */
let DirectiveDrop = class DirectiveDrop extends Directive {
    constructor(flag, pileAmount = 2000) {
        super(flag);
        this.memory.amount = pileAmount;
    }
    spawnMoarOverlords() {
        // No overlords associated with this directive
    }
    get targetedBy() {
        return Overmind.cache.targets[this.ref];
    }
    get drops() {
        if (!this.pos.isVisible) {
            return {};
        }
        if (!this._drops) {
            const drops = (this.pos.lookFor(LOOK_RESOURCES) || []);
            this._drops = _.groupBy(drops, drop => drop.resourceType);
        }
        return this._drops;
    }
    get store() {
        if (!this._store) {
            // Merge the "storage" of drops with the store of structure
            const store = { energy: 0 };
            // Merge with drops
            for (const resourceType of _.keys(this.drops)) {
                const totalResourceAmount = _.sum(this.drops[resourceType], drop => drop.amount);
                if (store[resourceType]) {
                    store[resourceType] += totalResourceAmount;
                }
                else {
                    store[resourceType] = totalResourceAmount;
                }
            }
            this._store = store;
        }
        return this._store;
    }
    refresh() {
        super.refresh();
        this._store = undefined;
    }
    registerEnergyRequests() {
        const threshold = 0.75;
        if (this.store.energy < threshold * this.memory.amount) {
            this.colony.logisticsNetwork.requestInput(this);
        }
    }
    init() {
        this.registerEnergyRequests();
        this.alert(`Drop directive active - ${_.sum(this.store)}`);
    }
    run() {
        const storagePos = this.colony.roomPlanner.storagePos;
        const upgradePos = this.colony.upgradeSite.batteryPos;
        if (storagePos && this.pos.isEqualTo(storagePos)) {
            if (this.colony.hatchery && this.colony.hatchery.batteries.length > 0) {
                this.remove();
            }
        }
        else if (upgradePos && this.pos.isEqualTo(upgradePos)) {
            if (this.colony.upgradeSite.battery) {
                this.remove();
            }
        }
        else {
            log.error('Drop directive placed on invalid location; removing!');
            this.remove();
        }
    }
};
DirectiveDrop.directiveName = 'haul';
DirectiveDrop.color = COLOR_GREEN;
DirectiveDrop.secondaryColor = COLOR_GREEN;
DirectiveDrop = __decorate([
    profile
], DirectiveDrop);
export { DirectiveDrop };
