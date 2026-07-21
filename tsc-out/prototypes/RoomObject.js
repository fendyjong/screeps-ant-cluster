"use strict";
// RoomObject prototypes
Object.defineProperty(RoomObject.prototype, 'ref', {
    get: function () {
        return this.id || this.name || '';
    },
    configurable: true,
});
Object.defineProperty(RoomObject.prototype, 'targetedBy', {
    get: function () {
        return Overmind.cache.targets[this.ref] || [];
    },
    configurable: true,
});
RoomObject.prototype.serialize = function () {
    const pos = {
        x: this.pos.x,
        y: this.pos.y,
        roomName: this.pos.roomName
    };
    return {
        pos: pos,
        ref: this.ref
    };
};
