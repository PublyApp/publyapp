import { describe, expect, test } from 'vitest';

import { toAggregatorRows } from './aggregators';

describe('toAggregatorRows', () => {
	test('ItShouldTreatAnEmptyConnectionObjectAsNotConnected', () => {
		const rows = toAggregatorRows({
			aggregators: [
				{ kind: 'partner', displayName: 'Partner', connection: {} },
			],
		});

		expect(rows[0]?.connection).toBeNull();
	});

	test('ItShouldMapAConnectionWithItsHintAndStatus', () => {
		const rows = toAggregatorRows({
			aggregators: [
				{
					kind: 'partner',
					displayName: 'Partner',
					connection: { status: 'invalid', keyHint: 'a1b2', lastError: 'no' },
				},
			],
		});

		expect(rows[0]?.connection).toMatchObject({
			isActive: false,
			keyHint: 'a1b2',
			lastError: 'no',
		});
	});
});
