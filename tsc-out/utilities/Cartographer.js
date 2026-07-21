var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Cartographer_1;
import { profile } from '../profiler/decorator';
export const ROOMTYPE_SOURCEKEEPER = 'SK';
export const ROOMTYPE_CORE = 'CORE';
export const ROOMTYPE_CONTROLLER = 'CTRL';
export const ROOMTYPE_ALLEY = 'ALLEY';
export const ROOMTYPE_CROSSROAD = 'CROSSROAD';
PERMACACHE.cartographerRoomTypes = PERMACACHE.cartographerRoomTypes || {};
/**
 * Cartographer: provides helper methods related to Game.map. A few of these methods have been modified from BonzAI
 * codebase, although I have introduced new methods of my own over time as well.
 */
let Cartographer = Cartographer_1 = class Cartographer {
    /**
     * Lists all rooms up to and including a given distance away, including roomName
     */
    static findRoomsInRange(roomName, depth) {
        return _.flatten(_.values(this.recursiveRoomSearch(roomName, depth)));
    }
    /**
     * Lists all rooms at exactly a given distance away, including roomName
     */
    static findRoomsAtRange(roomName, depth) {
        return this.recursiveRoomSearch(roomName, depth)[depth];
    }
    /**
     * Recursively enumerate all rooms from a root node using depth first search to a maximum depth
     */
    static recursiveRoomSearch(roomName, maxDepth) {
        const visitedRooms = this._recursiveRoomSearch(roomName, 0, maxDepth, {});
        const roomDepths = {};
        for (const room in visitedRooms) {
            const depth = visitedRooms[room];
            if (!roomDepths[depth]) {
                roomDepths[depth] = [];
            }
            roomDepths[depth].push(room);
        }
        return roomDepths;
    }
    /**
     * The recursive part of recursiveRoomSearch. Yields inverted results mapping roomName to depth.
     */
    static _recursiveRoomSearch(roomName, depth, maxDepth, visited) {
        if (visited[roomName] == undefined) {
            visited[roomName] = depth;
        }
        else {
            visited[roomName] = Math.min(depth, visited[roomName]);
        }
        const neighbors = _.values(Game.map.describeExits(roomName));
        if (depth < maxDepth) {
            for (const neighbor of neighbors) {
                // Visit the neighbor if not already done or if this would be a more direct route
                if (visited[neighbor] == undefined || depth + 1 < visited[neighbor]) {
                    this._recursiveRoomSearch(neighbor, depth + 1, maxDepth, visited);
                }
            }
        }
        return visited;
    }
    /**
     * Get the type of the room
     */
    static roomType(roomName) {
        if (!PERMACACHE.cartographerRoomTypes[roomName]) {
            let roomType;
            const coords = Cartographer_1.getRoomCoordinates(roomName);
            if (coords.x % 10 === 0 && coords.y % 10 === 0) {
                roomType = ROOMTYPE_CROSSROAD;
            }
            else if (coords.x % 10 === 0 || coords.y % 10 === 0) {
                roomType = ROOMTYPE_ALLEY;
            }
            else if (coords.x % 10 != 0 && coords.x % 5 === 0 && coords.y % 10 != 0 && coords.y % 5 === 0) {
                roomType = ROOMTYPE_CORE;
            }
            else if (coords.x % 10 <= 6 && coords.x % 10 >= 4 && coords.y % 10 <= 6 && coords.y % 10 >= 4) {
                roomType = ROOMTYPE_SOURCEKEEPER;
            }
            else {
                roomType = ROOMTYPE_CONTROLLER;
            }
            PERMACACHE.cartographerRoomTypes[roomName] = roomType;
        }
        return PERMACACHE.cartographerRoomTypes[roomName];
    }
    /**
     * Get the name of a room offset from the anchor room
     */
    static findRelativeRoomName(roomName, xDelta, yDelta) {
        const coords = this.getRoomCoordinates(roomName);
        let xDir = coords.xDir;
        if (xDir === 'W') {
            xDelta = -xDelta;
        }
        let yDir = coords.yDir;
        if (yDir === 'N') {
            yDelta = -yDelta;
        }
        let x = coords.x + xDelta;
        let y = coords.y + yDelta;
        if (x < 0) {
            x = Math.abs(x) - 1;
            xDir = this.oppositeDir(xDir);
        }
        if (y < 0) {
            // noinspection JSSuspiciousNameCombination
            y = Math.abs(y) - 1;
            yDir = this.oppositeDir(yDir);
        }
        return xDir + x + yDir + y;
    }
    /**
     * Find the relative x and y offsets of two rooms
     */
    static findRoomCoordDeltas(origin, otherRoom) {
        const originCoords = this.getRoomCoordinates(origin);
        const otherCoords = this.getRoomCoordinates(otherRoom);
        let xDelta = otherCoords.x - originCoords.x;
        if (originCoords.xDir !== otherCoords.xDir) {
            xDelta = otherCoords.x + originCoords.x + 1;
        }
        let yDelta = otherCoords.y - originCoords.y;
        if (originCoords.yDir !== otherCoords.yDir) {
            yDelta = otherCoords.y + originCoords.y + 1;
        }
        // normalize direction
        if (originCoords.xDir === 'W') {
            xDelta = -xDelta;
        }
        if (originCoords.yDir === 'N') {
            yDelta = -yDelta;
        }
        return { x: xDelta, y: yDelta };
    }
    /**
     * Returns the direction (not magnitude) of a room from an origin room
     */
    static findRelativeRoomDir(origin, otherRoom) {
        const coordDeltas = this.findRoomCoordDeltas(origin, otherRoom);
        // noinspection JSSuspiciousNameCombination
        if (Math.abs(coordDeltas.x) == Math.abs(coordDeltas.y)) {
            if (coordDeltas.x > 0) {
                if (coordDeltas.y > 0) {
                    return 2;
                }
                else {
                    return 4;
                }
            }
            else if (coordDeltas.x < 0) {
                if (coordDeltas.y > 0) {
                    return 8;
                }
                else {
                    return 6;
                }
            }
            else {
                return 0;
            }
        }
        else {
            // noinspection JSSuspiciousNameCombination
            if (Math.abs(coordDeltas.x) > Math.abs(coordDeltas.y)) {
                if (coordDeltas.x > 0) {
                    return 3;
                }
                else {
                    return 7;
                }
            }
            else {
                if (coordDeltas.y > 0) {
                    return 1;
                }
                else {
                    return 5;
                }
            }
        }
    }
    /**
     * Return the opposite direction, e.g. "W" => "E"
     */
    static oppositeDir(dir) {
        switch (dir) {
            case 'W':
                return 'E';
            case 'E':
                return 'W';
            case 'N':
                return 'S';
            case 'S':
                return 'N';
            default:
                return 'error';
        }
    }
    /**
     * Get the coordinates from a room name
     */
    static getRoomCoordinates(roomName) {
        const coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g;
        const match = coordinateRegex.exec(roomName);
        const xDir = match[1];
        const x = match[2];
        const yDir = match[3];
        const y = match[4];
        return {
            x: Number(x),
            y: Number(y),
            xDir: xDir,
            yDir: yDir,
        };
    }
};
Cartographer = Cartographer_1 = __decorate([
    profile
], Cartographer);
export { Cartographer };
// Register on global for debugging
global.Cartographer = Cartographer;
