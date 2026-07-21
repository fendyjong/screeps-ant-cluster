var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Mem } from '../memory/Memory';
import { profile } from '../profiler/decorator';
import { ema } from '../utilities/utils';
/**
 * Operational statistics, stored in Memory.stats, will be updated every (this many) ticks
 */
export const LOG_STATS_INTERVAL = 8;
let Stats = class Stats {
    static clean() {
        if (Game.time % LOG_STATS_INTERVAL == 0) {
            const protectedKeys = [
                'persistent',
            ];
            for (const key in Memory.stats) {
                if (!protectedKeys.includes(key)) {
                    delete Memory.stats[key];
                }
            }
        }
    }
    static log(key, value, truncateNumbers = true) {
        if (Game.time % LOG_STATS_INTERVAL == 0) {
            if (truncateNumbers && value != undefined) {
                const decimals = 5;
                if (typeof value == 'number') {
                    value = value.truncate(decimals);
                }
                else {
                    for (const i in value) {
                        value[i] = value[i].truncate(decimals);
                    }
                }
            }
            Mem.setDeep(Memory.stats, key, value);
        }
    }
    // static accumulate(key: string, value: number): void {
    // 	if (!Memory.stats[key]) {
    // 		Memory.stats[key] = 0;
    // 	}
    // 	Memory.stats[key] += value;
    // }
    static run() {
        if (Game.time % LOG_STATS_INTERVAL == 0) {
            // Record IVM heap statistics
            Memory.stats['cpu.heapStatistics'] = Game.cpu.getHeapStatistics();
            // Log GCL
            this.log('gcl.progress', Game.gcl.progress);
            this.log('gcl.progressTotal', Game.gcl.progressTotal);
            this.log('gcl.level', Game.gcl.level);
            // Log memory usage
            this.log('memory.used', RawMemory.get().length);
            // Log CPU
            this.log('cpu.limit', Game.cpu.limit);
            this.log('cpu.bucket', Game.cpu.bucket);
        }
        const used = Game.cpu.getUsed();
        this.log('cpu.getUsed', used);
        Memory.stats.persistent.avgCPU = ema(used, Memory.stats.persistent.avgCPU, 100);
        Memory.stats.persistent.empireAge = Memory.tick;
        Memory.stats.persistent.build = Memory.build;
    }
};
Stats = __decorate([
    profile
], Stats);
export { Stats };
