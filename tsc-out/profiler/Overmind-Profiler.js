// Internal profiler for Overmind; this can be used in conjunction with screeps-profiler
const defaultOvermindProfilerMemory = {};
export class OvermindProfiler {
    static profile(callback, identifier) {
        const start = Game.cpu.getUsed();
        callback();
        Memory.profiler[identifier] = Game.cpu.getUsed() - start;
    }
}
