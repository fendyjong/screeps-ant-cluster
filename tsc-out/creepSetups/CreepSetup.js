var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CreepSetup_1;
import { profile } from '../profiler/decorator';
import { BoostTypeBodyparts } from '../resources/map_resources';
/* Return the cost of an entire array of body parts */
export function bodyCost(bodyparts) {
    return _.sum(bodyparts, part => BODYPART_COST[part]);
}
export function patternCost(setup) {
    return bodyCost(setup.bodySetup.pattern);
}
/**
 * The CreepSetup class contains methods for flexibly generating creep body arrays when needed for spawning
 */
let CreepSetup = CreepSetup_1 = class CreepSetup {
    constructor(roleName, bodySetup = {}, boosts) {
        this.role = roleName;
        // Defaults for a creep setup
        _.defaults(bodySetup, {
            pattern: [],
            sizeLimit: Infinity,
            prefix: [],
            suffix: [],
            proportionalPrefixSuffix: false,
            ordered: true,
        });
        this.bodySetup = bodySetup;
        this.boosts = boosts || [];
        this.cache = {};
    }
    /**
     * Returns a new CreepSetup instance which is a copy of the existing setup but with boosts applied. This allows
     * you to easily make boosted versions of the default setups in setups.ts without modifying the original objects.
     */
    static boosted(setup, boosts) {
        return new CreepSetup_1(setup.role, setup.bodySetup, boosts);
    }
    /**
     * Generate the body and best boosts for a requested creep
     */
    create(colony, useCache = false) {
        // If you're allowed to use a cached result (e.g. for estimating wait times), return that
        if (useCache && this.cache[colony.name] && Game.time < this.cache[colony.name].expiration) {
            return this.cache[colony.name].result;
        }
        // Otherwise recompute
        const body = this.generateBody(colony.room.energyCapacityAvailable);
        const bodyCounts = _.countBy(body);
        const boosts = [];
        if (this.boosts.length > 0 && colony.evolutionChamber) {
            for (const boostType of this.boosts) {
                const numParts = bodyCounts[BoostTypeBodyparts[boostType]];
                const bestBoost = colony.evolutionChamber.bestBoostAvailable(boostType, numParts * LAB_BOOST_MINERAL);
                if (bestBoost) {
                    boosts.push(bestBoost);
                }
            }
        }
        const result = {
            body: body,
            boosts: boosts,
        };
        this.cache[colony.name] = {
            result: result,
            expiration: Game.time + 20,
        };
        return result;
    }
    /**
     * Generate the largest body of a given pattern that can be made from a room, subject to limitations from maxRepeats
     */
    generateBody(availableEnergy) {
        let patternCost, patternLength, numRepeats;
        const prefix = this.bodySetup.prefix;
        const suffix = this.bodySetup.suffix;
        let body = [];
        // calculate repetitions
        if (this.bodySetup.proportionalPrefixSuffix) { // if prefix and suffix are to be kept proportional to body size
            patternCost = bodyCost(prefix) + bodyCost(this.bodySetup.pattern) + bodyCost(suffix);
            patternLength = prefix.length + this.bodySetup.pattern.length + suffix.length;
            const energyLimit = Math.floor(availableEnergy / patternCost); // max number of repeats room can produce
            const maxPartLimit = Math.floor(MAX_CREEP_SIZE / patternLength); // max repetitions resulting in <50 parts
            numRepeats = Math.min(energyLimit, maxPartLimit, this.bodySetup.sizeLimit);
        }
        else { // if prefix and suffix don't scale
            const extraCost = bodyCost(prefix) + bodyCost(suffix);
            patternCost = bodyCost(this.bodySetup.pattern);
            patternLength = this.bodySetup.pattern.length;
            const energyLimit = Math.floor((availableEnergy - extraCost) / patternCost);
            const maxPartLimit = Math.floor((MAX_CREEP_SIZE - prefix.length - suffix.length) / patternLength);
            numRepeats = Math.min(energyLimit, maxPartLimit, this.bodySetup.sizeLimit);
        }
        // build the body
        if (this.bodySetup.proportionalPrefixSuffix) { // add the prefix
            for (let i = 0; i < numRepeats; i++) {
                body = body.concat(prefix);
            }
        }
        else {
            body = body.concat(prefix);
        }
        if (this.bodySetup.ordered) { // repeated body pattern
            for (const part of this.bodySetup.pattern) {
                for (let i = 0; i < numRepeats; i++) {
                    body.push(part);
                }
            }
        }
        else {
            for (let i = 0; i < numRepeats; i++) {
                body = body.concat(this.bodySetup.pattern);
            }
        }
        if (this.bodySetup.proportionalPrefixSuffix) { // add the suffix
            for (let i = 0; i < numRepeats; i++) {
                body = body.concat(suffix);
            }
        }
        else {
            body = body.concat(suffix);
        }
        // return it
        return body;
    }
    generateMaxedBody() {
        // TODO hardcoded for our current cap with extensions missing
        return this.generateBody(11100);
    }
    /**
     * Returns the number of parts that a body will have if made from a given colony
     */
    getBodyPotential(partType, colony) {
        // let energyCapacity = Math.max(colony.room.energyCapacityAvailable,
        // 							  colony.incubator ? colony.incubator.room.energyCapacityAvailable : 0);
        let energyCapacity = colony.room.energyCapacityAvailable;
        if (colony.spawnGroup) {
            const colonies = _.compact(_.map(colony.spawnGroup.memory.colonies, name => Overmind.colonies[name]));
            energyCapacity = _.max(_.map(colonies, colony => colony.room.energyCapacityAvailable));
        }
        const body = this.generateBody(energyCapacity);
        return _.filter(body, (part) => part == partType).length;
    }
};
CreepSetup = CreepSetup_1 = __decorate([
    profile
], CreepSetup);
export { CreepSetup };
