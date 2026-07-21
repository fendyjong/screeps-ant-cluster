// Type guards library: this allows for instanceof - like behavior for much lower CPU cost. Each type guard
// differentiates an ambiguous input by recognizing one or more unique properties.
// export interface EnergyStructure extends Structure {
// 	energy: number;
// 	energyCapacity: number;
// }
// export interface StoreStructure extends Structure {
// 	store: StoreDefinition;
// 	storeCapacity: number;
// }
// export function isEnergyStructure(obj: RoomObject): obj is EnergyStructure {
// 	return (<EnergyStructure>obj).energy != undefined && (<EnergyStructure>obj).energyCapacity != undefined;
// }
//
// export function isStoreStructure(obj: RoomObject): obj is StoreStructure {
// 	return (<StoreStructure>obj).store != undefined && (<StoreStructure>obj).storeCapacity != undefined;
// }
export function isStructure(obj) {
    return obj.structureType != undefined;
}
export function isOwnedStructure(structure) {
    return structure.owner != undefined;
}
export function isExtension(structure) {
    return structure.structureType == STRUCTURE_EXTENSION;
}
export function isRampart(structure) {
    return structure.structureType == STRUCTURE_RAMPART;
}
export function isRoad(structure) {
    return structure.structureType == STRUCTURE_ROAD;
}
export function isSpawn(structure) {
    return structure.structureType == STRUCTURE_SPAWN;
}
export function isLink(structure) {
    return structure.structureType == STRUCTURE_LINK;
}
export function isWall(structure) {
    return structure.structureType == STRUCTURE_WALL;
}
export function isStorage(structure) {
    return structure.structureType == STRUCTURE_STORAGE;
}
export function isTower(structure) {
    return structure.structureType == STRUCTURE_TOWER;
}
export function isObserver(structure) {
    return structure.structureType == STRUCTURE_OBSERVER;
}
export function isPowerSpawn(structure) {
    return structure.structureType == STRUCTURE_POWER_SPAWN;
}
export function isExtractor(structure) {
    return structure.structureType == STRUCTURE_EXTRACTOR;
}
export function isLab(structure) {
    return structure.structureType == STRUCTURE_LAB;
}
export function isTerminal(structure) {
    return structure.structureType == STRUCTURE_TERMINAL;
}
export function isContainer(structure) {
    return structure.structureType == STRUCTURE_CONTAINER;
}
export function isNuker(structure) {
    return structure.structureType == STRUCTURE_NUKER;
}
export function isFactory(structure) {
    return structure.structureType == STRUCTURE_FACTORY;
}
export function isSource(obj) {
    return obj.energy != undefined;
}
export function isTombstone(obj) {
    return obj.deathTime != undefined;
}
export function isRuin(obj) {
    return obj.destroyTime != undefined;
}
export function isResource(obj) {
    return obj.amount != undefined;
}
export function hasPos(obj) {
    return obj.pos != undefined;
}
export function isDirective(thing) {
    return thing.isDirective || false;
}
export function isCreep(obj) {
    return obj.fatigue != undefined;
}
export function isPowerCreep(obj) {
    return obj.powers != undefined;
}
export function isAnyZerg(thing) {
    return thing.isAnyZerg || false;
}
export function isStandardZerg(creep) {
    return creep.isStandardZerg || false;
}
export function isPowerZerg(creep) {
    return creep.isPowerZerg || false;
}
export function isCombatZerg(zerg) {
    return zerg.isCombatZerg || false;
}
export function isNeuralZerg(zerg) {
    return zerg.isNeuralZerg || false;
}
