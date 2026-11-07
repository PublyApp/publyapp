import { describe, expect, it } from 'vitest';

import {
	findExecutedTotal,
	mismatchMessage,
	parseShardPlan,
} from './test-api-shard.ts';

describe('test-api-shard', () => {
	it('reads the assigned count and filter out of the plan', () => {
		const plan = parseShardPlan(
			'API shard 2/4: 31 classes, 412 tests\ntests=412\nfilter=FullyQualifiedName~A.BSpec.\n',
		);

		expect(plan).toEqual({
			assigned: 412,
			filter: 'FullyQualifiedName~A.BSpec.',
		});
	});

	it('fails loudly instead of comparing against an empty plan', () => {
		expect(() => parseShardPlan('API shard 2/4: 31 classes')).toThrow(
			/tests=\/filter= lines/,
		);
	});

	it('reads the executed total from the last summary line', () => {
		const output = [
			'  Failed A.BSpec.ItShouldWork [12 ms]',
			'Total tests: 3',
			'     Passed: 2',
			'Total tests: 3',
			'     Passed: 2',
		].join('\n');

		expect(findExecutedTotal(output)).toBe(3);
		expect(
			findExecutedTotal(
				' MSBUILD : error MSB1009: project file does not exist',
			),
		).toBeNull();
	});

	it('is silent on a matching shard and names the mismatch otherwise', () => {
		expect(mismatchMessage(412, 412, 2, 4)).toBeNull();
		expect(mismatchMessage(412, 380, 2, 4)).toBe(
			'::error::API shard 2/4 executed 380 tests but was assigned 412',
		);
		expect(mismatchMessage(412, null, 2, 4)).toBe(
			'::error::API shard 2/4 executed no tests but was assigned 412',
		);
	});
});
