var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Abathur_1;
import { getAllColonies } from '../Colony';
import { maxMarketPrices, TraderJoe } from '../logistics/TradeNetwork';
import { profile } from '../profiler/decorator';
import { onPublicServer } from '../utilities/utils';
import { _baseResourcesLookup, _boostTierLookupAllTypes, _boostTypesTierLookup, _commoditiesLookup, _mineralCompoundsAllLookup, BASE_RESOURCES, BOOST_PARTS, BOOST_TIERS, DEPOSITS_ALL, INTERMEDIATE_REACTANTS, REAGENTS } from './map_resources';
export const REACTION_PRIORITIES = [
    // T1 Boosts
    BOOST_TIERS.attack.T1,
    BOOST_TIERS.heal.T1,
    BOOST_TIERS.ranged.T1,
    BOOST_TIERS.move.T1,
    BOOST_TIERS.construct.T1,
    BOOST_TIERS.dismantle.T1,
    // BOOST_TIERS.carry.T1,
    // BOOST_TIERS.harvest.T1, // not used yet
    BOOST_TIERS.tough.T1,
    // BOOST_TIERS.upgrade.T1,
    // Reaction intermediates + ghodium
    RESOURCE_GHODIUM,
    RESOURCE_ZYNTHIUM_KEANITE,
    RESOURCE_UTRIUM_LEMERGITE,
    RESOURCE_HYDROXIDE,
    // T2 Boosts
    BOOST_TIERS.attack.T2,
    BOOST_TIERS.heal.T2,
    BOOST_TIERS.ranged.T2,
    BOOST_TIERS.move.T2,
    // BOOST_TIERS.construct.T2,
    BOOST_TIERS.dismantle.T2,
    // BOOST_TIERS.carry.T2,
    // BOOST_TIERS.harvest.T2, // not used yet
    BOOST_TIERS.tough.T2,
    // BOOST_TIERS.upgrade.T2,
    // T3 Boosts
    BOOST_TIERS.attack.T3,
    BOOST_TIERS.heal.T3,
    BOOST_TIERS.ranged.T3,
    BOOST_TIERS.move.T3,
    // BOOST_TIERS.construct.T3,
    BOOST_TIERS.dismantle.T3,
    // BOOST_TIERS.carry.T3,
    // BOOST_TIERS.harvest.T3, // not used yet
    BOOST_TIERS.tough.T3,
    // BOOST_TIERS.upgrade.T3,
    // Other boosts I don't use as much
    BOOST_TIERS.construct.T2,
    BOOST_TIERS.construct.T3,
    BOOST_TIERS.carry.T1,
    BOOST_TIERS.carry.T2,
    BOOST_TIERS.carry.T3,
    BOOST_TIERS.upgrade.T1,
    BOOST_TIERS.upgrade.T2,
    BOOST_TIERS.upgrade.T3,
];
export const priorityStockAmounts = {
    XGHO2: 1000, // (-70 % dmg taken)
    XLHO2: 1000, // (+300 % heal)
    XZHO2: 1000, // (+300 % fat decr - speed)
    XZH2O: 1000, // (+300 % dismantle)
    XKHO2: 1000, // (+300 % ranged attack)
    XUH2O: 1000, // (+300 % attack)
    GHO2: 8000, // (-50 % dmg taken)
    LHO2: 8000, // (+200 % heal)
    ZHO2: 8000, // (+200 % fat decr - speed)
    ZH2O: 8000, // (+200 % dismantle)
    UH2O: 8000, // (+200 % attack)
    KHO2: 8000, // (+200 % ranged attack)
    GO: 1000, // (-30 % dmg taken)
    LO: 1000, // (+100 % heal)
    ZO: 1000, // (+100 % fat decr - speed)
    ZH: 1000, // (+100 % dismantle)
    UH: 1000, // (+100 % attack)
    KO: 1000, // (+100 % ranged attack)
    G: 2000, // For nukes and common compounds
};
export const wantedStockAmounts = {
    UH: 3000, // (+100 % attack)
    KO: 3000, // (+100 % ranged attack)
    XGHO2: 10000, // (-70 % dmg taken)
    XLHO2: 20000, // (+300 % heal)
    XZHO2: 6000, // (+300 % fat decr - speed)
    XZH2O: 6000, // (+300 % dismantle)
    XKHO2: 20000, // (+300 % ranged attack)
    XUH2O: 20000, // (+300 % attack)
    G: 5000, // For nukes
    XLH2O: 8000, // (+100 % build and repair)
    LH: 3000, // (+50 % build and repair)
    XUHO2: 3000, // (+600 % harvest)
    XKH2O: 3000, // (+300 % carry)
    ZK: 800, // intermediate
    UL: 800, // intermediate
    GH: 800, // (+50 % upgrade)
    KH: 800, // (+100 % carry)
    OH: 800, // intermediate
    GH2O: 800, // (+80 % upgrade)
    LH2O: 800, // (+80 % build and repair)
    KH2O: 800, // (+200 % carry)
    XGH2O: 12000, // (+100 % upgrade)
};
export const baseStockAmounts = {
    [RESOURCE_CATALYST]: 5000,
    [RESOURCE_ZYNTHIUM]: 5000,
    [RESOURCE_LEMERGIUM]: 5000,
    [RESOURCE_KEANIUM]: 5000,
    [RESOURCE_UTRIUM]: 5000,
    [RESOURCE_OXYGEN]: 5000,
    [RESOURCE_HYDROGEN]: 5000
};
/**
 * Abathur is responsible for the evolution of the swarm and directs global production of minerals. Abathur likes
 * efficiency, XGHO2, and high lab uptime, and dislikes pronouns.
 */
let Abathur = Abathur_1 = class Abathur {
    // Helper methods for identifying different types of resources
    static isMineralOrCompound(resource) {
        return !!_mineralCompoundsAllLookup[resource];
    }
    static isBaseMineral(resource) {
        return !!_baseResourcesLookup[resource];
    }
    static isIntermediateReactant(resource) {
        return INTERMEDIATE_REACTANTS.includes(resource);
    }
    static isBoost(resource) {
        return !!BOOST_PARTS[resource];
    }
    static isAttackBoost(resource) {
        return !!_boostTypesTierLookup.attack[resource];
    }
    static isRangedBoost(resource) {
        return !!_boostTypesTierLookup.ranged[resource];
    }
    static isHealBoost(resource) {
        return !!_boostTypesTierLookup.heal[resource];
    }
    static isToughBoost(resource) {
        return !!_boostTypesTierLookup.tough[resource];
    }
    static isMoveBoost(resource) {
        return !!_boostTypesTierLookup.move[resource];
    }
    static isDismantleBoost(resource) {
        return !!_boostTypesTierLookup.dismantle[resource];
    }
    static isConstructBoost(resource) {
        return !!_boostTypesTierLookup.construct[resource];
    }
    static isUpgradeBoost(resource) {
        return !!_boostTypesTierLookup.upgrade[resource];
    }
    static isHarvestBoost(resource) {
        return !!_boostTypesTierLookup.harvest[resource];
    }
    static isCarryBoost(resource) {
        return !!_boostTypesTierLookup.carry[resource];
    }
    static isDepositResource(resource) {
        return DEPOSITS_ALL.includes(resource);
    }
    static isCommodity(resource) {
        return !!_commoditiesLookup[resource];
    }
    static getBoostTier(boost) {
        return _boostTierLookupAllTypes[boost] || 'notaboost';
    }
    /**
     * Recursively enumerate the base ingredients required to synthesize a unit of the specified compound,
     * e.g. Abathur.enumerateReactionBaseIngredients("XGH2O") = Z,K,U,L,H,O,H,X
     */
    static enumerateReactionBaseIngredients(mineral) {
        if (BASE_RESOURCES.includes(mineral)) {
            return [mineral];
        }
        else if (REAGENTS[mineral]) {
            return Abathur_1.enumerateReactionBaseIngredients(REAGENTS[mineral][0])
                .concat(Abathur_1.enumerateReactionBaseIngredients(REAGENTS[mineral][1]));
        }
        else {
            return [];
        }
    }
    // Reaction scheduling =============================================================================================
    /**
     * Compute the next reaction that a colony should undertake based on local and global stockpiles of all target
     * compounds.
     */
    static getNextReaction(colony) {
        const BATCH_SIZE = Abathur_1.settings.batchSize;
        const globalAssets = Overmind.terminalNetwork.getAssets();
        const numColonies = _.filter(getAllColonies(), colony => !!colony.terminal).length;
        let possibleReactions = REACTION_PRIORITIES;
        if (colony.labs.length < 10) { // don't make the really long cooldown stuff if you don't have all labs
            possibleReactions = _.filter(possibleReactions, resource => (REACTION_TIME[resource] || Infinity) <= 30);
        }
        // Want to build up a stockpile of high tier boosts, but also to maintain and utilize a stockpile of the
        // cheaper stuff before we start building up higher tier boosts, which have declining returns
        let nextTargetResource;
        const ingredientsUnavailable = {}; // track what we can't make to save CPU
        const maxAmountOfEachBoostPerColony = 50000;
        const maxBatches = Math.ceil(maxAmountOfEachBoostPerColony / BATCH_SIZE);
        for (const batchNum of _.range(1, maxBatches)) {
            nextTargetResource = _.find(possibleReactions, resource => {
                // If we've already figured out we can't make this in a previous pass then skip it
                if (ingredientsUnavailable[resource])
                    return false;
                const tier = Abathur_1.getBoostTier(resource);
                // Get 2 labs' worth of a stockpile before you start making T2 boosts
                if (tier == 'T2' && batchNum * BATCH_SIZE < 2 * LAB_MINERAL_CAPACITY)
                    return false;
                // Get 3 labs' worth of a stockpile before you start making T3 boosts
                if (tier == 'T3' && batchNum * BATCH_SIZE < 3 * LAB_MINERAL_CAPACITY)
                    return false;
                // Don't need to stockpile a ton of reaction intermediates or ghodium
                if (resource == RESOURCE_GHODIUM || Abathur_1.isIntermediateReactant(resource)) {
                    // If the colony already has more of this this intermediate than it wants, skip it
                    if (colony.assets[resource] > Overmind.terminalNetwork.thresholds(colony, resource).target) {
                        return false;
                    }
                }
                // Otherwise, we're allowed to make more of this, so figure out what we should and can make
                const globalShortage = globalAssets[resource] / numColonies < (batchNum - 3) * BATCH_SIZE;
                const localShortage = colony.assets[resource] < batchNum * BATCH_SIZE;
                if (globalShortage || localShortage) {
                    // Do we have enough ingredients (or can we obtain enough) to make this step of the reaction?
                    const [reagent1, reagent2] = REAGENTS[resource];
                    const reagent1Available = colony.assets[reagent1] >= BATCH_SIZE ||
                        Overmind.terminalNetwork.canObtainResource(colony, reagent1, BATCH_SIZE);
                    const reagent2Available = colony.assets[reagent2] >= BATCH_SIZE ||
                        Overmind.terminalNetwork.canObtainResource(colony, reagent2, BATCH_SIZE);
                    if (reagent1Available && reagent2Available) {
                        return true;
                    }
                    else {
                        ingredientsUnavailable[resource] = true; // canObtainResource() is expensive; cache it
                    }
                }
                // We can't make this thing :(
                return false;
            });
            if (nextTargetResource)
                break;
        }
        if (nextTargetResource) {
            return { mineralType: nextTargetResource, amount: BATCH_SIZE };
        }
    }
    static canReceiveBasicMineralsForReaction(mineralQuantities, amount) {
        for (const mineral in mineralQuantities) {
            if (!Abathur_1.someColonyHasExcess(mineral, mineralQuantities[mineral])) {
                return false;
            }
        }
        return true;
    }
    static canBuyBasicMineralsForReaction(mineralQuantities) {
        if (Game.market.credits < TraderJoe.settings.market.credits.canBuyAbove) {
            return false;
        }
        for (const mineral in mineralQuantities) {
            let maxPrice = maxMarketPrices[mineral] || maxMarketPrices.default;
            if (!onPublicServer()) {
                maxPrice = Infinity;
            }
            if (Overmind.tradeNetwork.priceOf(mineral) > maxPrice) {
                return false;
            }
        }
        return true;
    }
    static stockAmount(resource) {
        return 0; // (wantedStockAmounts[resource] || priorityStockAmounts[resource] || baseStockAmounts[resource] || 0);
    }
    static hasExcess(colony, mineralType, excessAmount = 0) {
        return colony.assets[mineralType] - excessAmount > Abathur_1.stockAmount(mineralType);
    }
    static someColonyHasExcess(mineralType, excessAmount = 0) {
        return _.any(getAllColonies(), colony => Abathur_1.hasExcess(colony, mineralType, excessAmount));
    }
    /**
     * Generate a queue of reactions to produce the most needed compound
     */
    static getReactionQueue(colony, verbose = false) {
        // Compute the reaction queue for the highest priority item that you should be and can be making
        const stocksToCheck = [priorityStockAmounts, wantedStockAmounts];
        for (const stocks of stocksToCheck) {
            for (const resourceType in stocks) {
                const amountOwned = colony.assets[resourceType];
                const amountNeeded = stocks[resourceType];
                if (amountOwned < amountNeeded) { // if there is a shortage of this resource
                    const reactionQueue = Abathur_1.buildReactionQueue(colony, resourceType, amountNeeded - amountOwned, verbose);
                    const missingBaseMinerals = Abathur_1.getMissingBasicMinerals(colony, reactionQueue);
                    if (!_.any(missingBaseMinerals)
                        || this.canReceiveBasicMineralsForReaction(missingBaseMinerals, amountNeeded + 1000)
                        || this.canBuyBasicMineralsForReaction(missingBaseMinerals)) {
                        return reactionQueue;
                    }
                    else {
                        if (verbose)
                            console.log(`Missing minerals for ${resourceType}: ${JSON.stringify(missingBaseMinerals)}`);
                    }
                }
            }
        }
        // If there's nothing you can make, sleep for 100 ticks
        // this.memory.sleepUntil = Game.time + Abathur.settings.sleepTime;
        return [];
    }
    /**
     * Build a reaction queue for a target compound
     */
    static buildReactionQueue(colony, mineral, amount, verbose = false) {
        amount = Abathur_1.settings.batchSize; // minMax(amount, Abathur.settings.minBatchSize, Abathur.settings.maxBatchSize);
        if (verbose)
            console.log(`Abathur@${colony.room.print}: building reaction queue for ${amount} ${mineral}`);
        let reactionQueue = [];
        for (const ingredient of Abathur_1.enumerateReactionProducts(mineral)) {
            let productionAmount = amount;
            if (ingredient != mineral) {
                if (verbose) {
                    console.log(`productionAmount: ${productionAmount}, assets: ${colony.assets[ingredient]}`);
                }
                productionAmount = Math.max(productionAmount - (colony.assets[ingredient]), 0);
            }
            productionAmount = Math.min(productionAmount, Abathur_1.settings.batchSize);
            reactionQueue.push({ mineralType: ingredient, amount: productionAmount });
        }
        if (verbose)
            console.log(`Pre-trim queue: ${JSON.stringify(reactionQueue)}`);
        reactionQueue = Abathur_1.trimReactionQueue(reactionQueue);
        if (verbose)
            console.log(`Post-trim queue: ${JSON.stringify(reactionQueue)}`);
        reactionQueue = _.filter(reactionQueue, rxn => rxn.amount > 0);
        if (verbose)
            console.log(`Final queue: ${JSON.stringify(reactionQueue)}`);
        return reactionQueue;
    }
    /**
     * Trim a reaction queue, reducing the amounts of precursor compounds which need to be produced
     */
    static trimReactionQueue(reactionQueue) {
        // Scan backwards through the queue and reduce the production amount of subsequently baser resources as needed
        reactionQueue.reverse();
        for (const reaction of reactionQueue) {
            const [ing1, ing2] = REAGENTS[reaction.mineralType];
            const precursor1 = _.findIndex(reactionQueue, rxn => rxn.mineralType == ing1);
            const precursor2 = _.findIndex(reactionQueue, rxn => rxn.mineralType == ing2);
            for (const index of [precursor1, precursor2]) {
                if (index != -1) {
                    if (reactionQueue[index].amount == 0) {
                        reactionQueue[index].amount = 0;
                    }
                    else {
                        reactionQueue[index].amount = Math.min(reaction.amount, reactionQueue[index].amount);
                    }
                }
            }
        }
        reactionQueue.reverse();
        return reactionQueue;
    }
    /**
     * Figure out which basic minerals are missing and how much
     */
    static getMissingBasicMinerals(colony, reactionQueue, verbose = false) {
        const requiredBasicMinerals = Abathur_1.getRequiredBasicMinerals(reactionQueue);
        if (verbose)
            console.log(`Required basic minerals: ${JSON.stringify(requiredBasicMinerals)}`);
        if (verbose)
            console.log(`assets: ${JSON.stringify(colony.assets)}`);
        const missingBasicMinerals = {};
        for (const mineralType in requiredBasicMinerals) {
            const amountMissing = requiredBasicMinerals[mineralType] - colony.assets[mineralType];
            if (amountMissing > 0) {
                missingBasicMinerals[mineralType] = amountMissing;
            }
        }
        if (verbose)
            console.log(`Missing basic minerals: ${JSON.stringify(missingBasicMinerals)}`);
        return missingBasicMinerals;
    }
    /**
     * Get the required amount of basic minerals for a reaction queue
     */
    static getRequiredBasicMinerals(reactionQueue) {
        const requiredBasicMinerals = {
            [RESOURCE_HYDROGEN]: 0,
            [RESOURCE_OXYGEN]: 0,
            [RESOURCE_UTRIUM]: 0,
            [RESOURCE_KEANIUM]: 0,
            [RESOURCE_LEMERGIUM]: 0,
            [RESOURCE_ZYNTHIUM]: 0,
            [RESOURCE_CATALYST]: 0,
        };
        for (const reaction of reactionQueue) {
            const ingredients = REAGENTS[reaction.mineralType];
            for (const ingredient of ingredients) {
                if (!REAGENTS[ingredient]) { // resource is base mineral
                    requiredBasicMinerals[ingredient] += reaction.amount;
                }
            }
        }
        return requiredBasicMinerals;
    }
    /**
     * Recursively generate a list of outputs from reactions required to generate a compound
     */
    static enumerateReactionProducts(mineral) {
        if (!REAGENTS[mineral] || _.isEmpty(mineral)) {
            return [];
        }
        else {
            return Abathur_1.enumerateReactionProducts(REAGENTS[mineral][0])
                .concat(Abathur_1.enumerateReactionProducts(REAGENTS[mineral][1]), mineral);
        }
    }
};
Abathur.settings = {
    batchSize: 1600,
};
Abathur = Abathur_1 = __decorate([
    profile
], Abathur);
export { Abathur };
global.Abathur = Abathur;
