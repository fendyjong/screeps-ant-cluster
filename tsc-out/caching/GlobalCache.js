var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../profiler/decorator';
import { getCacheExpiration } from '../utilities/utils';
const CACHE_TIMEOUT = 50;
const SHORT_CACHE_TIMEOUT = 10;
const COSTMATRIX_TIMEOUT = 20;
const PATH_TIMEOUT = 1000;
/**
 * The GlobalCache ($) module saves frequently accessed deserialized objects in temporary, volatile global memory
 */
let $ = class $ {
    static structures(saver, key, callback, timeout = CACHE_TIMEOUT) {
        const cacheKey = saver.ref + 's' + key;
        if (!_cache.structures[cacheKey] || Game.time > _cache.expiration[cacheKey]) {
            // Recache if new entry or entry is expired
            _cache.structures[cacheKey] = callback();
            _cache.expiration[cacheKey] = getCacheExpiration(timeout, Math.ceil(timeout / 10));
        }
        else {
            // Refresh structure list by ID if not already done on current tick
            if ((_cache.accessed[cacheKey] || 0) < Game.time) {
                _cache.structures[cacheKey] = _.compact(_.map(_cache.structures[cacheKey] || [], s => Game.getObjectById(s.id)));
                _cache.accessed[cacheKey] = Game.time;
            }
        }
        return _cache.structures[cacheKey];
    }
    static number(saver, key, callback, timeout = SHORT_CACHE_TIMEOUT) {
        const cacheKey = saver.ref + '#' + key;
        if (_cache.numbers[cacheKey] == undefined || Game.time > _cache.expiration[cacheKey]) {
            // Recache if new entry or entry is expired
            _cache.numbers[cacheKey] = callback();
            _cache.expiration[cacheKey] = getCacheExpiration(timeout, Math.ceil(timeout / 10));
        }
        return _cache.numbers[cacheKey];
    }
    static numberRecall(saver, key) {
        const cacheKey = saver.ref + '#' + key;
        return _cache.numbers[cacheKey];
    }
    // static pos(saver: { ref: string }, key: string, callback: () => RoomPosition, timeout ?: number): RoomPosition;
    static pos(saver, key, callback, timeout) {
        const cacheKey = saver.ref + 'p' + key;
        if (_cache.roomPositions[cacheKey] == undefined || Game.time > _cache.expiration[cacheKey]) {
            // Recache if new entry or entry is expired
            _cache.roomPositions[cacheKey] = callback();
            if (!timeout)
                timeout = CACHE_TIMEOUT;
            _cache.expiration[cacheKey] = getCacheExpiration(timeout, Math.ceil(timeout / 10));
        }
        return _cache.roomPositions[cacheKey];
    }
    static list(saver, key, callback, timeout = CACHE_TIMEOUT) {
        const cacheKey = saver.ref + 'l' + key;
        if (_cache.lists[cacheKey] == undefined || Game.time > _cache.expiration[cacheKey]) {
            // Recache if new entry or entry is expired
            _cache.lists[cacheKey] = callback();
            _cache.expiration[cacheKey] = getCacheExpiration(timeout, Math.ceil(timeout / 10));
        }
        return _cache.lists[cacheKey];
    }
    /**
     * Caches a CostMatrix computation. Times out quickly, but you can use $.costMatrixRecall() to pull the value for
     * an invisible room without triggering a recalc
     */
    static costMatrix(roomName, key, callback, timeout = COSTMATRIX_TIMEOUT) {
        const cacheKey = roomName + 'm' + key;
        if (_cache.costMatrices[cacheKey] == undefined || Game.time > _cache.expiration[cacheKey]) {
            // Recache if new entry or entry is expired
            _cache.costMatrices[cacheKey] = callback();
            _cache.expiration[cacheKey] = getCacheExpiration(timeout, Math.ceil(timeout / 10));
        }
        return _cache.costMatrices[cacheKey];
    }
    /**
     * Returns the value of a previously cached CostMatrix without triggering a cache expiration and recalc
     */
    static costMatrixRecall(roomName, key) {
        const cacheKey = roomName + ':' + key;
        return _cache.costMatrices[cacheKey];
    }
    static path(fromPos, toPos, opts /*todo*/) {
        // TODO
        return [];
    }
    static set(thing, key, callback, timeout = CACHE_TIMEOUT) {
        const cacheKey = thing.ref + '$' + key;
        if (!_cache.things[cacheKey] || Game.time > _cache.expiration[cacheKey]) {
            // Recache if new entry or entry is expired
            _cache.things[cacheKey] = callback();
            _cache.expiration[cacheKey] = getCacheExpiration(timeout, Math.ceil(timeout / 10));
        }
        else {
            // Refresh structure list by ID if not already done on current tick
            if ((_cache.accessed[cacheKey] || 0) < Game.time) {
                if (_.isArray(_cache.things[cacheKey])) {
                    _cache.things[cacheKey] = _.compact(_.map(_cache.things[cacheKey], s => Game.getObjectById(s.id)));
                }
                else {
                    _cache.things[cacheKey] = Game.getObjectById(_cache.things[cacheKey].id);
                }
                _cache.accessed[cacheKey] = Game.time;
            }
        }
        thing[key] = _cache.things[cacheKey];
    }
    static refresh(thing, ...keys) {
        _.forEach(keys, function (key) {
            if (thing[key]) {
                if (_.isArray(thing[key])) {
                    thing[key] = _.compact(_.map(thing[key], s => Game.getObjectById(s.id)));
                }
                else {
                    thing[key] = Game.getObjectById(thing[key].id);
                }
            }
        });
    }
    static refreshObject(thing, ...keys) {
        _.forEach(keys, function (key) {
            if (_.isObject(thing[key])) {
                for (const prop in thing[key]) {
                    if (_.isArray(thing[key][prop])) {
                        // @ts-ignore
                        thing[key][prop] = _.compact(_.map(thing[key][prop], s => Game.getObjectById(s.id)));
                    }
                    else {
                        // @ts-ignore
                        thing[key][prop] = Game.getObjectById(thing[key][prop].id);
                    }
                }
            }
        });
    }
    static refreshRoom(thing) {
        thing.room = Game.rooms[thing.room.name];
    }
};
$ = __decorate([
    profile
], $);
export { $ };
