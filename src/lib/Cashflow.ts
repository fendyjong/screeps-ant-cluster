import { CashflowHealth } from '../types';
import { bodyCost } from '../hatchery/Body';

const ALPHA = 0.1;
const BUILD_RATE_WINDOW = 50;

function getRate(key: 'incomeRate' | 'spawnRate' | 'buildRate', roomName: string): number {
	const cf = Memory.v1.cashflow?.[roomName];
	if (!cf) return 0;
	return cf[key] || 0;
}

function setRate(key: 'incomeRate' | 'spawnRate' | 'buildRate', roomName: string, value: number): void {
	if (!Memory.v1.cashflow) Memory.v1.cashflow = {};
	if (!Memory.v1.cashflow[roomName]) Memory.v1.cashflow[roomName] = { incomeRate: 0, spawnRate: 0, buildRate: 0 };
	Memory.v1.cashflow[roomName][key] = value;
}

function ema(old: number, sample: number): number {
	return old + ALPHA * (sample - old);
}

export function computeEmergencyReserve(room: Room): number {
	let reserve = 0;
	for (const name in Game.creeps) {
		const c = Game.creeps[name];
		if (c.memory.roomName !== room.name) continue;
		if (c.ticksToLive !== undefined && c.ticksToLive < 100) {
			const parts = c.body.map(p => p.type) as BodyPartConstant[];
			reserve += bodyCost(parts);
		}
	}
	return reserve;
}

export function trackIncome(roomName: string, totalEnergy: number, prevTotalEnergy: number): void {
	const delta = totalEnergy - prevTotalEnergy;
	if (delta > 0) {
		const old = getRate('incomeRate', roomName);
		setRate('incomeRate', roomName, ema(old, delta));
	}
}

export function trackSpawn(roomName: string, cost: number): void {
	const old = getRate('spawnRate', roomName);
	setRate('spawnRate', roomName, ema(old, cost));
}

export function trackBuild(roomName: string, progressDelta: number): void {
	const old = getRate('buildRate', roomName);
	setRate('buildRate', roomName, ema(old, progressDelta));
}

export function getHealth(room: Room): CashflowHealth {
	const reserve = computeEmergencyReserve(room);
	if (room.energyAvailable < reserve) return 'red';

	const income = getRate('incomeRate', room.name);
	const spend = getRate('spawnRate', room.name) + getRate('buildRate', room.name);
	if (income > spend * 1.1) return 'green';
	return 'yellow';
}

export function getBudget(room: Room): { spawnBudget: number; buildBudget: number; reserve: number } {
	const reserve = computeEmergencyReserve(room);
	const spawnBudget = Math.max(0, room.energyAvailable - reserve);
	const spawnRate = getRate('spawnRate', room.name);
	const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
	const buildBudget = Math.max(0, storageEnergy - spawnRate * BUILD_RATE_WINDOW);
	return { spawnBudget, buildBudget, reserve };
}