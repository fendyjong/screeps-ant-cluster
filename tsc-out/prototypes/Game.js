"use strict";
// Modifications to Game-level functions
const _marketDeal = Game.market.deal;
Game.market.deal = function (orderId, amount, targetRoomName) {
    const response = _marketDeal(orderId, amount, targetRoomName);
    if (response == OK) {
        if (targetRoomName && Game.rooms[targetRoomName] && Game.rooms[targetRoomName].terminal
            && Game.rooms[targetRoomName].terminal.my) {
            // Mark the terminal as being blocked
            Game.rooms[targetRoomName].terminal._notReady = true;
        }
    }
    return response;
};
