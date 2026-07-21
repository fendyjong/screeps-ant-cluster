var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Pathing } from '../../movement/Pathing';
import { MiningOverlord } from '../../overlords/mining/miner';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Cartographer, ROOMTYPE_SOURCEKEEPER } from '../../utilities/Cartographer';
import { ema, getCacheExpiration } from '../../utilities/utils';
import { Directive } from '../Directive';
const defaultDirectiveHarvestMemory = {
    ["u" /* HARVEST_MEM.USAGE */]: 1,
    ["d" /* HARVEST_MEM.DOWNTIME */]: 0,
};
/**
 * Standard mining directive. Mines from an owned, remote, or source keeper room
 */
let DirectiveHarvest = class DirectiveHarvest extends Directive {
    constructor(flag) {
        super(flag);
        if (this.colony) {
            this.colony.miningSites[this.name] = this;
            this.colony.destinations.push({ pos: this.pos, order: this.memory["T" /* MEM.TICK */] || Game.time });
        }
        _.defaultsDeep(this.memory, defaultDirectiveHarvestMemory);
    }
    // Hauling distance
    get distance() {
        if (!this.memory["P" /* HARVEST_MEM.PATHING */] || Game.time >= this.memory["P" /* HARVEST_MEM.PATHING */]["X" /* MEM.EXPIRATION */]) {
            const distance = Pathing.distance(this.colony.pos, this.pos) || Infinity;
            const expiration = getCacheExpiration(this.colony.storage ? 5000 : 1000);
            this.memory["P" /* HARVEST_MEM.PATHING */] = {
                ["D" /* MEM.DISTANCE */]: distance,
                ["X" /* MEM.EXPIRATION */]: expiration
            };
        }
        return this.memory["P" /* HARVEST_MEM.PATHING */]["D" /* MEM.DISTANCE */];
    }
    spawnMoarOverlords() {
        // Create a mining overlord for this
        let priority = OverlordPriority.ownedRoom.mine;
        if (!(this.room && this.room.my)) {
            priority = Cartographer.roomType(this.pos.roomName) == ROOMTYPE_SOURCEKEEPER ?
                OverlordPriority.remoteSKRoom.mine : OverlordPriority.remoteRoom.mine;
        }
        this.overlords.mine = new MiningOverlord(this, priority);
    }
    init() {
    }
    run() {
        this.computeStats();
    }
    computeStats() {
        const source = this.overlords.mine.source;
        if (source && source.ticksToRegeneration == 1) {
            this.memory["u" /* HARVEST_MEM.USAGE */] = (source.energyCapacity - source.energy) / source.energyCapacity;
        }
        const container = this.overlords.mine.container;
        this.memory["d" /* HARVEST_MEM.DOWNTIME */] = +(ema(container ? +container.isFull : 0, this.memory["d" /* HARVEST_MEM.DOWNTIME */], CREEP_LIFE_TIME)).toFixed(5);
    }
};
DirectiveHarvest.directiveName = 'harvest';
DirectiveHarvest.color = COLOR_YELLOW;
DirectiveHarvest.secondaryColor = COLOR_YELLOW;
DirectiveHarvest = __decorate([
    profile
], DirectiveHarvest);
export { DirectiveHarvest };
