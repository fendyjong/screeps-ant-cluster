var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../console/log';
import { profile } from '../profiler/decorator';
/**
 * Abstract class for a hive cluster. Hive clusters group structures with related functionalities together in a
 * single cohesive object
 */
let HiveCluster = class HiveCluster {
    constructor(colony, instantiationObject, name) {
        this.colony = colony;
        this.room = instantiationObject.room;
        this.pos = instantiationObject.pos;
        this.ref = name + '@' + this.colony.name;
        this.colony.hiveClusters.push(this);
    }
    get print() {
        return '<a href="#!/room/' + Game.shard.name + '/' + this.pos.roomName + '">[' + this.ref + ']</a>';
    }
    debug(...args) {
        if (this.memory.debug) {
            log.alert(this.print, args);
        }
    }
};
HiveCluster = __decorate([
    profile
], HiveCluster);
export { HiveCluster };
