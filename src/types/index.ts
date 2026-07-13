// src/types/index.ts

import { BunkerLayout } from '../colony/LayoutPlanner';
import { SwapPlan } from '../colony/SwapPlanner';
import { SpawnRequest } from '../hatchery/Request';

export interface TaskMemory {
	type: 'harvest' | 'transfer' | 'withdraw' | 'pickup' | 'build' | 'repair' | 'upgrade' | 'dismantle' | 'recharge'
	targetId: string
}

export interface CreepMemory {
	role: string
	roomName: string
	task?: TaskMemory
	_stuckTicks?: number
	_lastPos?: { x: number; y: number; roomName: string }
	_path?: string
}

export interface LayoutMemory {
	bunker?: BunkerLayout;
	swap?: SwapPlan;
	lastUpdated?: number;
}

export interface RoomMemory {
	layout?: LayoutMemory;
}

export interface TerrainCache {
	matrix: number[];
	tick: number;
	version: number;
}

export interface PathingMemory {
	terrain: Record<string, TerrainCache>;
	structureCache: Record<string, { matrix: number[]; structSig: number }>;
	traffic: Record<string, Record<string, number>>;
	pendingRoads: { roomName: string; x: number; y: number }[];
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
	ttl: number
}

export interface HatcheryMemory {
	queue: Record<string, SpawnRequestData[]>
	deathWatch: Record<string, Record<string, DeathWatchEntry[]>>
}

export type CashflowHealth = 'green' | 'yellow' | 'red';

export interface CashflowMemory {
	incomeRate: number
	spawnRate: number
	buildRate: number
}

export interface GameEvents {
	hostile?: Record<string, { tick: number; room: string; threat: 'scout' | 'swarm' }>
	expansion?: Record<string, { sourceRoom: string; targetRoom: string; tick: number }>
}

declare global {
	interface Memory {
		v1: {
			hatchery: HatcheryMemory
			cashflow?: Record<string, CashflowMemory>
			events?: GameEvents
			pathing?: PathingMemory
			hud?: {
				cpuTick: Record<string, number>
				lastThreat: Record<string, number>
			}
			_prevTotalEnergy?: Record<string, number>
			_prevProgress?: Record<string, number>
		}
	}
}