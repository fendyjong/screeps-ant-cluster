var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { getAllColonies } from '../Colony';
import { log } from '../console/log';
import { Pathing } from '../movement/Pathing';
import { profile } from '../profiler/decorator';
import { randint } from '../utilities/random';
import { equalXYR, randomHex, toColumns } from '../utilities/utils';
import { NotifierPriority } from './Notifier';
export const DEFAULT_MAX_PATH_LENGTH = 800;
const DEFAULT_MAX_LINEAR_RANGE = 15;
const DIRECTIVE_PATH_TIMEOUT = 30000;
/**
 * Directives are contextual wrappers for flags and serve as attachment points for Overlords, acting as a sort of
 * "process table" for the bot, with individual processes (Overlords) run by the scheulder (Overseer)
 */
let Directive = class Directive {
    // waypoints?: RoomPosition[];					// List of portals to travel through to reach destination
    constructor(flag, colonyFilter) {
        this.memory = flag.memory;
        this.name = flag.name;
        this.ref = flag.ref;
        // Register creation tick
        if (!this.memory["T" /* MEM.TICK */]) {
            this.memory["T" /* MEM.TICK */] = Game.time;
        }
        // if (this.memory.waypoints) {
        // 	this.waypoints = _.map(this.memory.waypoints, posName => getPosFromString(posName)!);
        // }
        // Relocate flag if needed; this must be called before the colony calculations
        if (this.memory.setPos) {
            const setPosition = derefRoomPosition(this.memory.setPos);
            if (!this.flag.pos.isEqualTo(setPosition)) {
                this.flag.setPosition(setPosition);
            }
            else {
                delete this.memory.setPos;
            }
            this.pos = setPosition;
            this.room = Game.rooms[setPosition.roomName];
        }
        else {
            this.pos = flag.pos;
            this.room = flag.room;
        }
        // Delete the directive if expired
        if (this.memory["X" /* MEM.EXPIRATION */] && !this.memory.persistent && Game.time > this.memory["X" /* MEM.EXPIRATION */]) {
            log.alert(`Removing expired directive ${this.print}!`);
            flag.remove();
            return;
        }
        // Handle colony assigning
        const forceRecalc = !!this.memory.recalcColonyOnTick && Game.time >= this.memory.recalcColonyOnTick;
        const colony = this.getColony(colonyFilter, forceRecalc);
        // Delete the directive if the colony is dead
        if (!colony) {
            if (Overmind.exceptions.length == 0) {
                log.alert(`Could not get colony for directive ${this.print}; removing flag!`);
                flag.remove();
            }
            else {
                log.alert(`Could not get colony for directive ${this.print}; ` +
                    `exceptions present this tick, so won't remove`);
            }
            return;
        }
        // Register colony and add flags to colony.flags
        this.colony = colony;
        this.colony.flags.push(flag);
        this.overlords = {};
        // Run creation actions if needed
        if (this.age == 0) {
            this.onCreation();
        }
        // Register directive on Overmind
        global[this.name] = this;
        Overmind.overseer.registerDirective(this);
        Overmind.directives[this.name] = this;
    }
    get print() {
        return '<a href="#!/room/' + Game.shard.name + '/' + this.pos.roomName + '">[' + this.name + ']</a>';
    }
    debug(...args) {
        if (this.memory.debug) {
            log.alert(this.print, args);
        }
    }
    get age() {
        return Game.time - this.memory["T" /* MEM.TICK */];
    }
    info() {
        let msg = `Info for ${this.print}: —————————————————————————————————————————————————————————————————————————`;
        const info1 = {
            'Type:': this.directiveName,
            'Name:': this.name,
            'Pos:': this.pos.print,
            'Colony:': this.colony.print,
        };
        msg += toColumns(info1).join('\n');
        msg += `Overlords: \n`;
        const tab = `  `;
        for (const overlordName in this.overlords) {
            msg += tab + `${overlordName}:\n`;
            const olInfo = {};
            const overlord = this.overlords[overlordName];
            olInfo[tab + tab + 'Creep usage:'] = JSON.stringify(overlord.creepUsageReport);
            olInfo[tab + tab + 'Zerg:'] = _.mapValues(overlord._zerg, zergOfRole => _.map(zergOfRole, (zerg) => zerg.print));
            olInfo[tab + tab + 'CombatZerg:'] = _.mapValues(overlord._combatZerg, zergOfRole => _.map(zergOfRole, (zerg) => zerg.print));
            msg += toColumns(olInfo).join('\n');
        }
        msg += 'Memory:\n' + print(this.memory);
        return msg;
    }
    /**
     * Gets an effective room position for a directive; allows you to reference this.pos in constructor super() without
     * throwing an error
     */
    static getPos(flag) {
        if (flag.memory && flag.memory.setPos) {
            const pos = derefRoomPosition(flag.memory.setPos);
            return pos;
        }
        return flag.pos;
    }
    // Flag must be a getter to avoid caching issues
    get flag() {
        return Game.flags[this.name];
    }
    // This allows you to access static DirectiveClass.directiveName from an instance of DirectiveClass
    get directiveName() {
        return this.constructor.directiveName;
    }
    refresh() {
        const flag = this.flag;
        if (!flag) {
            log.warning(`Missing flag for directive ${this.print}! Removing directive.`);
            this.remove();
            return;
        }
        this.memory = flag.memory;
        this.pos = flag.pos;
        this.room = flag.room;
    }
    alert(message, priority = NotifierPriority.Normal) {
        Overmind.overseer.notifier.alert(message, this.pos.roomName, priority);
    }
    /**
     * Returns values for weighted and unweighted path length from colony and recomputes if necessary.
     */
    get distanceFromColony() {
        if (!this.memory["D" /* MEM.DISTANCE */] || Game.time >= this.memory["D" /* MEM.DISTANCE */]["X" /* MEM.EXPIRATION */]) {
            const ret = Pathing.findPath(this.colony.pos, this.pos, { maxOps: DIRECTIVE_PATH_TIMEOUT });
            const terrainCache = {};
            const terrainWeighted = _.sum(ret.path, pos => {
                let terrain;
                if (!terrainCache[pos.roomName]) {
                    terrainCache[pos.roomName] = Game.map.getRoomTerrain(pos.roomName);
                }
                terrain = terrainCache[pos.roomName];
                return terrain.get(pos.x, pos.y) == TERRAIN_MASK_SWAMP ? 5 : 1;
            });
            this.memory["D" /* MEM.DISTANCE */] = {
                ["u" /* MEM_DISTANCE.UNWEIGHTED */]: ret.path.length,
                ["w" /* MEM_DISTANCE.WEIGHTED */]: terrainWeighted,
                ["X" /* MEM.EXPIRATION */]: Game.time + 10000 + randint(0, 100),
            };
            if (ret.incomplete) {
                this.memory["D" /* MEM.DISTANCE */].incomplete = true;
            }
        }
        const memDistance = this.memory["D" /* MEM.DISTANCE */];
        if (memDistance.incomplete) {
            log.warning(`${this.print}: distanceFromColony() info incomplete!`);
        }
        return {
            unweighted: memDistance["u" /* MEM_DISTANCE.UNWEIGHTED */],
            terrainWeighted: memDistance["w" /* MEM_DISTANCE.WEIGHTED */],
        };
    }
    handleRelocation() {
        if (this.memory.setPos) {
            const pos = derefRoomPosition(this.memory.setPos);
            if (!this.flag.pos.isEqualTo(pos)) {
                const result = this.flag.setPosition(pos);
                if (result == OK) {
                    log.debug(`Moving ${this.name} from ${this.flag.pos.print} to ${pos.print}.`);
                }
                else {
                    log.warning(`Could not set room position to ${JSON.stringify(this.memory.setPos)}!`);
                }
            }
            else {
                delete this.memory.setPos;
            }
            this.pos = pos;
            this.room = Game.rooms[pos.roomName];
            return true;
        }
        return false;
    }
    /**
     * Computes the parent colony for the directive to be handled by
     */
    getColony(colonyFilter, forceRecalc = false) {
        // If something is written to flag.colony, use that as the colony
        if (this.memory["C" /* MEM.COLONY */] && !forceRecalc) {
            return Overmind.colonies[this.memory["C" /* MEM.COLONY */]];
        }
        else {
            // If flag contains a colony name as a substring, assign to that colony, regardless of RCL
            const colonyNames = _.keys(Overmind.colonies);
            for (const name of colonyNames) {
                if (this.name.includes(name)) {
                    if (this.name.split(name)[1] != '')
                        continue; // in case of other substring, e.g. E11S12 and E11S1
                    this.memory["C" /* MEM.COLONY */] = name;
                    return Overmind.colonies[name];
                }
            }
            // If flag is in a room belonging to a colony and the colony has sufficient RCL, assign to there
            const colony = Overmind.colonies[Overmind.colonyMap[this.pos.roomName]];
            if (colony) {
                if (!colonyFilter || colonyFilter(colony)) {
                    this.memory["C" /* MEM.COLONY */] = colony.name;
                    return colony;
                }
            }
            // Otherwise assign to closest colony
            const maxPathLength = this.memory.maxPathLength || DEFAULT_MAX_PATH_LENGTH;
            const maxLinearRange = this.memory.maxLinearRange || DEFAULT_MAX_LINEAR_RANGE;
            this.debug(`Recalculating colony association for ${this.name} in ${this.pos.roomName}`);
            let nearestColony;
            let minDistance = Infinity;
            for (const colony of getAllColonies()) {
                if (Game.map.getRoomLinearDistance(this.pos.roomName, colony.name) > maxLinearRange
                    && !this.memory.allowPortals) {
                    continue;
                }
                if (!colonyFilter || colonyFilter(colony)) {
                    const ret = Pathing.findPath((colony.hatchery || colony).pos, this.pos, { maxOps: DIRECTIVE_PATH_TIMEOUT });
                    // TODO handle directives that can't find a path at great range
                    if (!ret.incomplete) {
                        if (ret.path.length < maxPathLength && ret.path.length < minDistance) {
                            nearestColony = colony;
                            minDistance = ret.path.length;
                        }
                        if (ret.portalUsed && ret.portalUsed.expiration) {
                            this.memory.recalcColonyOnTick = ret.portalUsed.expiration + 1;
                        }
                        this.debug(`Path length to ${colony.room.print}: ${ret.path.length}`);
                    }
                    else {
                        this.debug(`Incomplete path from ${colony.room.print}`);
                    }
                }
            }
            if (nearestColony) {
                log.info(`Colony ${nearestColony.room.print} assigned to ${this.name}.`);
                this.memory["C" /* MEM.COLONY */] = nearestColony.room.name;
                return nearestColony;
            }
            else {
                log.error(`Could not find colony match for ${this.name} in ${this.pos.roomName}! ` +
                    `Try setting memory.maxPathLength and memory.maxLinearRange.`);
            }
        }
    }
    // Wrapped flag methods ============================================================================================
    remove(force = false) {
        if (!this.memory.persistent || force) {
            delete Overmind.directives[this.name];
            delete global[this];
            Overmind.overseer.removeDirective(this);
            if (this.colony) {
                _.remove(this.colony.flags, flag => flag.name == this.name);
            }
            if (this.flag) { // check in case flag was removed manually in last build cycle
                return this.flag.remove();
            }
        }
    }
    setColor(color, secondaryColor) {
        if (secondaryColor) {
            return this.flag.setColor(color, secondaryColor);
        }
        else {
            return this.flag.setColor(color);
        }
    }
    setPosition(pos) {
        // Ignore the (x,y) setPosition option since I never use it
        return this.flag.setPosition(pos);
    }
    // Custom directive methods ========================================================================================
    /* Create an appropriate flag to instantiate this directive in the next tick */
    static create(pos, opts = {}) {
        let flagName = opts.name || undefined;
        if (!flagName) {
            flagName = this.directiveName + ':' + randomHex(6);
            if (Game.flags[flagName]) {
                return ERR_NAME_EXISTS;
            }
        }
        if (!opts.quiet) {
            log.alert(`Creating ${this.directiveName} directive at ${pos.print}!`);
        }
        const result = pos.createFlag(flagName, this.color, this.secondaryColor);
        if (result == flagName && opts.memory) {
            Memory.flags[flagName] = opts.memory;
        }
        log.debug(`Result: ${result}, memory: ${JSON.stringify(Memory.flags[result])}`);
        return result;
    }
    /**
     * Returns whether a directive of this type is present either at this position or within the room of this name
     */
    static isPresent(posOrRoomName) {
        if (PHASE != 'run' && PHASE != 'init') {
            log.error(`Directive.isPresent() will only give correct results in init() and run() phases!`);
            return true; // usually we want to do something if directive isn't present; so this minimizes bad results
        }
        if (typeof posOrRoomName === 'string') {
            const roomName = posOrRoomName;
            const directivesInRoom = Overmind.overseer.getDirectivesInRoom(roomName);
            return _.filter(directivesInRoom, directive => this.filter(directive.flag)).length > 0;
        }
        else {
            const pos = posOrRoomName;
            const directivesInRoom = Overmind.overseer.getDirectivesInRoom(pos.roomName);
            return _.filter(directivesInRoom, directive => this.filter(directive.flag) && equalXYR(pos, directive.pos)).length > 0;
        }
    }
    /**
     * Create a directive if one of the same type is not already present (in room | at position).
     * Calling this method on positions in invisible rooms can be expensive and should be used sparingly.
     */
    static createIfNotPresent(pos, scope, opts = {}) {
        if (PHASE != 'run') {
            log.error(`Directive.createIfNotPresent() can only be called during the run phase!`);
            return;
        }
        // Do nothing if flag is already here
        if (scope == 'pos') {
            if (this.isPresent(pos))
                return;
        }
        else {
            if (this.isPresent(pos.roomName))
                return;
        }
        const room = Game.rooms[pos.roomName];
        if (!room) {
            if (!opts.memory) {
                opts.memory = {};
            }
            opts.memory.setPos = pos;
        }
        switch (scope) {
            case 'room':
                if (room) {
                    return this.create(pos, opts);
                }
                else {
                    log.info(`Creating directive at ${pos.print}... ` +
                        `No visibility in room; directive will be relocated on next tick.`);
                    let createAtPos;
                    if (opts.memory && opts.memory["C" /* MEM.COLONY */]) {
                        createAtPos = Pathing.findPathablePosition(opts.memory["C" /* MEM.COLONY */]);
                    }
                    else {
                        createAtPos = Pathing.findPathablePosition(_.first(getAllColonies()).room.name);
                    }
                    return this.create(createAtPos, opts);
                }
            case 'pos':
                if (room) {
                    return this.create(pos, opts);
                }
                else {
                    log.info(`Creating directive at ${pos.print}... ` +
                        `No visibility in room; directive will be relocated on next tick.`);
                    let createAtPos;
                    if (opts.memory && opts.memory["C" /* MEM.COLONY */]) {
                        createAtPos = Pathing.findPathablePosition(opts.memory["C" /* MEM.COLONY */]);
                    }
                    else {
                        createAtPos = Pathing.findPathablePosition(_.first(getAllColonies()).room.name);
                    }
                    return this.create(createAtPos, opts);
                }
        }
    }
    /**
     * Filter for _.filter() that checks if a flag is of the matching type
     */
    static filter(flag) {
        return flag.color == this.color && flag.secondaryColor == this.secondaryColor;
    }
    /**
     * Map a list of flags to directive using the filter of the subclassed directive
     */
    static find(flags) {
        flags = _.filter(flags, flag => this.filter(flag));
        return _.compact(_.map(flags, flag => Overmind.directives[flag.name]));
    }
    /**
     * Map a list of flags to directive using the filter of the subclassed directive
     */
    static findInRoom(roomName) {
        const directivesInRoom = Overmind.overseer.getDirectivesInRoom(roomName);
        return _.filter(directivesInRoom, directive => this.filter(directive.flag));
    }
    /**
     * Map a list of flags to directive using the filter of the subclassed directive
     */
    static findInColony(colony) {
        const directivesInColony = Overmind.overseer.getDirectivesForColony(colony);
        return _.filter(directivesInColony, directive => this.filter(directive.flag));
    }
    // /**
    //  * Directive.creation() should contain any necessary logic for creating the directive (if the directive is
    //  * automatically placeable); this gets called for every type of directive every tick.
    //  */
    // static creation(): void {
    //
    // }
    /**
     * Actions that are performed only once on the tick of the directive creation
     */
    onCreation() {
    }
    // /**
    //  * Directive.removal() should contain any necessary logic for removing the directive.
    //  */
    // removal(): void {
    //
    // }
    /**
     * Override Directive.visuals() to display any relevant information via room visuals
     */
    visuals() {
    }
};
Directive = __decorate([
    profile
], Directive);
export { Directive };
