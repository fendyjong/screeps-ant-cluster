"use strict";
String.prototype.padRight = function (length, char = ' ') {
    return this + char.repeat(Math.max(length - this.length, 0));
};
String.prototype.padLeft = function (length, char = ' ') {
    return char.repeat(Math.max(length - this.length, 0)) + this;
};
Number.prototype.toPercent = function (decimals = 0) {
    return (this * 100).toFixed(decimals) + '%';
};
Number.prototype.truncate = function (decimals) {
    const re = new RegExp('(\\d+\\.\\d{' + decimals + '})(\\d)'), m = this.toString().match(re);
    return m ? parseFloat(m[1]) : this.valueOf();
};
PERMACACHE.structureWalkability = PERMACACHE.structureWalkability || {};
Object.defineProperty(ConstructionSite.prototype, 'isWalkable', {
    get() {
        if (PERMACACHE.structureWalkability[this.id] === undefined) {
            PERMACACHE.structureWalkability[this.id] = this.structureType == STRUCTURE_ROAD ||
                this.structureType == STRUCTURE_CONTAINER ||
                this.structureType == STRUCTURE_RAMPART;
        }
        return PERMACACHE.structureWalkability[this.id];
    },
    configurable: true,
});
