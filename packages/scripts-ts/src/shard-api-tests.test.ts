import { beforeAll, describe, expect, it } from 'vitest';

import {
	discoverSuite,
	filterSuiteByModules,
	parseListing,
	planShard,
	shardOf,
	type Suite,
} from './shard-api-tests.ts';

const TOTAL = 4;
const SHARDS = [1, 2, 3, 4];

describe('shard-api-tests listing', () => {
	it('counts every listed line per class (identical theory rows included) and keeps prefix-related classes apart', () => {
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
		expect(suite.get('A.B.FooSpec')).toBe(3);
		expect(suite.get('A.B.FooSpecExtra')).toBe(1);
		expect(planShard(suite, 1, 1).tests).toBe(4);
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

describe('shard-api-tests module selection', () => {
	const suite: Suite = new Map([
		['PublyApp.Api.Modules.Posts.Handlers.CreatePostSpec', 7],
		['PublyApp.Api.Modules.Posts.Services.PostServiceSpec', 3],
		['PublyApp.Api.Modules.PostsArchive.Handlers.OldPostSpec', 2],
		['PublyApp.Api.Modules.Users.Handlers.FindUserSpec', 5],
		['PublyApp.Api.Lib.Architecture.TenantPredicateGuardSpec', 1],
	]);

	it('keeps exactly the classes of the selected modules', () => {
		const filtered = filterSuiteByModules(suite, ['Posts']);

		expect([...(filtered ?? new Map()).keys()].sort()).toEqual([
			'PublyApp.Api.Modules.Posts.Handlers.CreatePostSpec',
			'PublyApp.Api.Modules.Posts.Services.PostServiceSpec',
		]);
	});

	it('falls back to the full suite when no class matches the selection', () => {
		expect(filterSuiteByModules(suite, ['Analytics'])).toBeUndefined();
		expect(filterSuiteByModules(suite, [])).toBeUndefined();
	});

	it('gives every selected class to exactly one shard and an empty shard is not an error', () => {
		const filtered = filterSuiteByModules(suite, ['Posts', 'Users']);
		expect(filtered).toBeDefined();

		const owners = new Map<string, number[]>();
		let assignedTests = 0;
		for (const shard of SHARDS) {
			const plan = planShard(filtered ?? new Map(), shard, TOTAL, true);
			assignedTests += plan.tests;
			for (const className of plan.classes) {
				owners.set(className, [...(owners.get(className) ?? []), shard]);
			}
		}

		expect([...owners].filter(([, owned]) => owned.length !== 1)).toEqual([]);
		expect([...owners.keys()].sort()).toEqual(
			[...(filtered ?? new Map()).keys()].sort(),
		);
		expect(assignedTests).toBe(15);
	});

	it('still refuses an empty shard when the full suite is expected', () => {
		const oneClass: Suite = new Map([
			['PublyApp.Api.Modules.Posts.Handlers.CreatePostSpec', 1],
		]);
		const owningShard = shardOf(
			'PublyApp.Api.Modules.Posts.Handlers.CreatePostSpec',
			TOTAL,
		);
		const emptyShard = SHARDS.find((shard) => shard !== owningShard) ?? 0;
		expect(() => planShard(oneClass, emptyShard, TOTAL)).toThrow(
			/owns no test classes/,
		);
		expect(planShard(oneClass, emptyShard, TOTAL, true)).toEqual({
			classes: [],
			tests: 0,
			filter: '',
		});
	});
});

describe('shard-api-tests real suite', () => {
	// Real discovery: builds the Test configuration if stale, then lists it.
	// A missing project or empty listing throws instead of skipping.
	let suite: Suite;
	beforeAll(() => {
		suite = discoverSuite();
	}, 900_000);

	it('selects only the touched module from the real suite', () => {
		const filtered = filterSuiteByModules(suite, ['Posts']);
		expect(filtered).toBeDefined();
		const classes = [...(filtered ?? new Map()).keys()];
		expect(classes.length).toBeGreaterThan(0);
		expect(classes.length).toBeLessThan(suite.size);
		expect(
			classes.every((className) =>
				className.startsWith('PublyApp.Api.Modules.Posts.'),
			),
		).toBe(true);

		let selectedTests = 0;
		for (const shard of SHARDS) {
			selectedTests += planShard(
				filtered ?? new Map(),
				shard,
				TOTAL,
				true,
			).tests;
		}
		let expectedTests = 0;
		for (const tests of (filtered ?? new Map()).values()) {
			expectedTests += tests;
		}
		expect(selectedTests).toBe(expectedTests);
	}, 600_000);

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
			fullSuiteTests += tests;
		}
		expect(assignedTests).toBe(fullSuiteTests);
	}, 600_000);
});
