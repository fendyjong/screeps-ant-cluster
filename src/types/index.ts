// src/types/index.ts

import { BunkerLayout, SwapPlan } from '../colony/Architect';
import { SpawnRequest } from '../hatchery/Request';

export enum Goal {
	ECONOMY = 'economy',
	DEFEND = 'defend',
	RECOVER = 'recover',
}

export interface RoleTargets {
	harvester: number;
	hauler: number;
	builder: number;
	upgrader: number;
}

export interface CreepMemory {
	role: string;
	roomName: string;
}

export interface LayoutMemory {
	bunker?: BunkerLayout;
	swap?: SwapPlan;
	lastUpdated?: number;
}

export interface RoomMemory {
	goal: Goal;
	layout?: LayoutMemory;
}

export interface TerrainCache {
	matrix: number[];
	tick: number;
}

export interface PathingMemory {
	terrain: Record<string, TerrainCache>;
}

export interface SpawnRequestData {
	role: string
	priority: number
	bodyMin: number[]
	bodyIdeal: number[]
	count: number
	memory: Record<string, unknown>
	createdAt: number
	roomName: string
}

export interface DeathWatchEntry {
	name: string
	ttl: number // ticks remaining
}

export interface HatcheryMemory {
	queue: Record<string, SpawnRequestData[]>
	deathWatch: Record<string, Record<string, DeathWatchEntry[]>>
}

declare global {
	interface Memory {
		v1: {
			hatchery: HatcheryMemory
		}
		pathing?: PathingMemory
	}
}