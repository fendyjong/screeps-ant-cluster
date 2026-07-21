var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../profiler/decorator';
const MAX_ACTIVE_SEGMENTS = 10;
const DefaultSegmenterMemory = {
    activeSegments: [],
    activeForeignSegment: undefined,
    publicSegments: [],
};
export const SEGMENTS = {
    reinforcementLearning: 70,
    remoteDebugger: 97,
    assimilator: 98,
};
if (!Memory.segmenter) {
    Memory.segmenter = {};
}
_.defaultsDeep(Memory.segmenter, DefaultSegmenterMemory);
/**
 * The segmenter module controls public and private segment memory access
 */
let Segmenter = class Segmenter {
    static get memory() {
        return Memory.segmenter;
    }
    static requestSegments(...ids) {
        for (const id of ids) {
            if (!this.memory.activeSegments.includes(id)) {
                this.memory.activeSegments.push(id);
                if (this.memory.activeSegments.length > MAX_ACTIVE_SEGMENTS) {
                    const removeSegment = this.memory.activeSegments.shift();
                    console.log(`Maximum active segments reached. Discarding segment ${removeSegment}.`);
                }
            }
        }
    }
    static getSegment(id) {
        if ((this.cache.lastAccessed[id] || 0) > (this.cache.lastModified[id] || 0)) {
            return this.cache.segments[id];
        }
        const str = RawMemory.segments[id];
        let segment;
        try {
            segment = JSON.parse(str);
        }
        catch (e) {
            console.log(`Creating new object for RawMemory.segments[${id}].`);
            segment = {};
            this.cache.segments[id] = segment;
            this.cache.lastModified[id] = Game.time;
        }
        this.cache.segments[id] = segment;
        this.cache.lastAccessed[id] = Game.time;
        return this.cache.segments[id];
    }
    static getSegmentProperty(id, key) {
        const segment = this.getSegment(id);
        return segment[key];
    }
    static setSegment(id, value) {
        this.cache.segments[id] = value;
        this.cache.lastModified[id] = Game.time;
    }
    static setSegmentProperty(id, key, value) {
        const segment = this.getSegment(id);
        segment[key] = value;
        this.cache.lastModified[id] = Game.time;
    }
    static requestForeignSegment(username, id) {
        if (username) {
            this.memory.activeForeignSegment = {
                username: username,
                id: id,
            };
        }
    }
    static markSegmentAsPublic(id) {
        if (!this.memory.publicSegments.includes(id)) {
            this.memory.publicSegments.push(id);
        }
    }
    static getForeignSegment() {
        if (RawMemory.foreignSegment) {
            let segment;
            try {
                segment = JSON.parse(RawMemory.foreignSegment.data);
                return segment;
            }
            catch (e) {
                console.log(`Could not parse RawMemory.foreignSegment.data!`);
            }
        }
    }
    static getForeignSegmentProperty(key) {
        if (RawMemory.foreignSegment) {
            let segment;
            try {
                segment = JSON.parse(RawMemory.foreignSegment.data);
            }
            catch (e) {
                segment = {};
                console.log(`Could not parse RawMemory.foreignSegment.data!`);
            }
            return segment[key];
        }
    }
    static run() {
        // Set active, public, and foreign segments
        RawMemory.setActiveSegments(this.memory.activeSegments);
        RawMemory.setPublicSegments(this.memory.publicSegments);
        if (this.memory.activeForeignSegment) {
            RawMemory.setActiveForeignSegment(this.memory.activeForeignSegment.username, this.memory.activeForeignSegment.id);
        }
        else {
            RawMemory.setActiveForeignSegment(null);
        }
        // Write things that have been modified this tick to memory
        for (const id in this.cache.lastModified) {
            if (this.cache.lastModified[id] == Game.time) {
                RawMemory.segments[id] = JSON.stringify(this.cache.segments[id]);
            }
        }
    }
};
Segmenter.cache = {
    segments: {},
    lastAccessed: {},
    lastModified: {},
};
Segmenter = __decorate([
    profile
], Segmenter);
export { Segmenter };
