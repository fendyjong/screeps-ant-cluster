var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { HaulingOverlord } from '../../overlords/situational/hauler';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
/**
 * Hauling directive: spawns hauler creeps to move large amounts of resources from a location (e.g. draining a storage)
 */
let DirectiveHaul = class DirectiveHaul extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
        this.overlords.haul = new HaulingOverlord(this);
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
    get hasDrops() {
        return _.keys(this.drops).length > 0;
    }
    get storeStructure() {
        // TODO remove me console.log(`Looking for store struct in ${this.pos.roomName}
        // with ${this.pos.lookForStructure(STRUCTURE_CONTAINER)}`);
        if (this.pos.isVisible) {
            return this.pos.lookForStructure(STRUCTURE_STORAGE) ||
                this.pos.lookForStructure(STRUCTURE_TERMINAL) ||
                this.pos.lookForStructure(STRUCTURE_NUKER) ||
                this.pos.lookForStructure(STRUCTURE_CONTAINER) ||
                this.pos.lookFor(LOOK_RUINS).filter(ruin => _.sum(ruin.store) > 0)[0];
        }
        return undefined;
    }
    get store() {
        if (!this._store) {
            // Merge the "storage" of drops with the store of structure
            let store = {};
            if (this.storeStructure) {
                store = this.storeStructure.store;
            }
            else {
                store = { energy: 0 };
            }
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
        // log.alert(`Haul directive ${this.print} has store of ${JSON.stringify(this._store)}`);
        return this._store;
    }
    /**
     * Total amount of resources remaining to be transported; cached into memory in case room loses visibility
     */
    get totalResources() {
        if (this.pos.isVisible && this.store) {
            this.memory.totalResources = _.sum(this.store); // update total amount remaining
        }
        else {
            if (this.memory.totalResources == undefined) {
                return 1000; // pick some non-zero number so that haulers will spawn
            }
        }
        return this.memory.totalResources;
    }
    refresh() {
        super.refresh();
        this._store = undefined;
    }
    init() {
        this.alert(`Haul directive active - ${this.totalResources}`);
    }
    run() {
        if (this.pos.isVisible && _.sum(this.store) == 0) {
            // If everything is picked up, crudely give enough time to bring it back
            this._finishAtTime = this._finishAtTime || (Game.time + 300);
        }
        if (Game.time >= this._finishAtTime || (this.totalResources == 0 &&
            this.overlords.haul.haulers.length == 0)) {
            // this.remove();
        }
    }
};
DirectiveHaul.directiveName = 'haul';
DirectiveHaul.color = COLOR_YELLOW;
DirectiveHaul.secondaryColor = COLOR_BLUE;
DirectiveHaul = __decorate([
    profile
], DirectiveHaul);
export { DirectiveHaul };
