import { BodyPartConstant } from 'screeps';

const PART_COST: Record<string, number> = {
	[WORK]: 100,
	[CARRY]: 50,
	[MOVE]: 50,
	[ATTACK]: 80,
	[RANGED_ATTACK]: 150,
	[HEAL]: 250,
	[TOUGH]: 10,
	[CLAIM]: 600,
};

export function bodyCost(body: BodyPartConstant[]): number {
	return body.reduce((sum, p) => sum + (PART_COST[p] || 0), 0);
}

export function scaleBody(
	min: BodyPartConstant[],
	ideal: BodyPartConstant[],
	availableEnergy: number
): BodyPartConstant[] | null {
	const minCost = bodyCost(min);
	if (minCost > availableEnergy) return null;

	const body: BodyPartConstant[] = [...min];
	let remaining = availableEnergy - minCost;

	for (let i = min.length; i < ideal.length && body.length < 50; i++) {
		const part = ideal[i];
		const cost = PART_COST[part] || 0;
		if (cost <= remaining) {
			body.push(part);
			remaining -= cost;
		} else {
			break;
		}
	}

	return body;
}

export function serializeBody(body: BodyPartConstant[]): number[] {
	const map: Record<string, number> = {
		[WORK]: 1,
		[CARRY]: 2,
		[MOVE]: 3,
		[ATTACK]: 4,
		[RANGED_ATTACK]: 5,
		[HEAL]: 6,
		[TOUGH]: 7,
		[CLAIM]: 8,
	};
	return body.map(p => map[p] || 0);
}

export function deserializeBody(data: number[]): BodyPartConstant[] {
	const map: Record<number, BodyPartConstant> = {
		1: WORK,
		2: CARRY,
		3: MOVE,
		4: ATTACK,
		5: RANGED_ATTACK,
		6: HEAL,
		7: TOUGH,
		8: CLAIM,
	};
	return data.map(n => map[n] || WORK);
}