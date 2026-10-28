import { beforeAll, describe, expect, it } from 'vitest';

import {
	discoverSuite,
	parseListing,
	planShard,
	shardOf,
	type Suite,
} from './shard-api-tests.ts';

const TOTAL = 4;
const SHARDS = [1, 2, 3, 4];

describe('shard-api-tests listing', () => {
	it('groups by class, dedupes per class and keeps prefix-related classes apart', () => {
		const suite = parseListing(
			[
				'Test run for x.dll',
				'The following Tests are available:',
				'    A.B.FooSpec.ItShouldOne',
				'    A.B.FooSpec.ItShouldOne',
				'    A.B.FooSpec.ItShouldTwo(value: "x.y(z)")',
				'    A.B.FooSpecExtra.ItShouldOne',
				'',
			].join('\n'),
		);
		expect(suite.get('A.B.FooSpec')?.size).toBe(2);
		expect(suite.get('A.B.FooSpecExtra')?.size).toBe(1);
		const { filter } = planShard(suite, 1, 1);
		expect(filter.split('|')).toContain('FullyQualifiedName~A.B.FooSpec.');
		expect(filter.split('|')).toContain('FullyQualifiedName~A.B.FooSpecExtra.');
	});

	it('fails loudly on a missing or unparseable listing', () => {
		expect(() => parseListing('')).toThrow(/no "The following Tests/);
		expect(() => parseListing('The following Tests are available:\n')).toThrow(
			/empty/,
		);
		expect(() =>
			parseListing(
				'The following Tests are available:\n    Outer+Inner.Spec.It',
			),
		).toThrow(/plain class name/);
	});

	it('pins the hash so class ownership stays stable', () => {
		expect(
			shardOf('PublyApp.Api.Lib.Architecture.OpenApiContractSpec', TOTAL),
		).toBe(4);
	});
});

describe('shard-api-tests real suite', () => {
	// Real discovery: builds the Test configuration if stale, then lists it.
	// A missing project or empty listing throws instead of skipping.
	let suite: Suite;
	beforeAll(() => {
		suite = discoverSuite();
	}, 900_000);

	it('gives every class to exactly one shard and the union is the full suite', () => {
		const owners = new Map<string, number[]>();
		let assignedTests = 0;
		for (const shard of SHARDS) {
			const plan = planShard(suite, shard, TOTAL);
			assignedTests += plan.tests;
			for (const className of plan.classes) {
				owners.set(className, [...(owners.get(className) ?? []), shard]);
			}
		}
		const multiOwned = [...owners].filter(([, shards]) => shards.length !== 1);
		expect(multiOwned).toEqual([]);
		expect([...owners.keys()].sort()).toEqual([...suite.keys()].sort());
		let fullSuiteTests = 0;
		for (const tests of suite.values()) {
			fullSuiteTests += tests.size;
		}
		expect(assignedTests).toBe(fullSuiteTests);
	}, 600_000);
});
