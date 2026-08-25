import { describe, expect, test } from 'vitest';

import {
	getBulkRevokeEligibleIds,
	getIneligibleRevokeCount,
} from './bulk-revoke-eligibility';

describe('getBulkRevokeEligibleIds', () => {
	test('keeps only pending invitations', () => {
		expect(
			getBulkRevokeEligibleIds([
				{ id: 'a', status: 'pending' },
				{ id: 'b', status: 'accepted' },
				{ id: 'c', status: 'pending' },
			]),
		).toEqual(['a', 'c']);
	});

	// Statuses arrive as raw backend strings ("Pending"); normalize
	// lowercase-trim exactly like the list's own normalization.
	test('normalizes raw backend status casing and whitespace', () => {
		expect(
			getBulkRevokeEligibleIds([
				{ id: 'a', status: ' Pending ' },
				{ id: 'b', status: 'ACCEPTED' },
			]),
		).toEqual(['a']);
	});

	test('treats a missing status as ineligible (never revokes on a guess)', () => {
		expect(
			getBulkRevokeEligibleIds([
				{ id: 'a', status: null },
				{ id: 'b', status: undefined },
				{ id: 'c', status: '' },
				{ id: 'd', status: 'pending' },
			]),
		).toEqual(['d']);
	});
});

describe('getIneligibleRevokeCount', () => {
	test('counts selected rows that are not pending', () => {
		expect(
			getIneligibleRevokeCount(
				[
					{ id: 'a', status: 'pending' },
					{ id: 'b', status: 'accepted' },
					{ id: 'c', status: 'revoked' },
				],
				['a', 'b', 'c'],
			),
		).toBe(2);
	});

	test('returns zero when every selected row is pending', () => {
		expect(
			getIneligibleRevokeCount([{ id: 'a', status: 'pending' }], ['a']),
		).toBe(0);
	});

	test('ignores rows that are not part of the selection', () => {
		expect(
			getIneligibleRevokeCount(
				[
					{ id: 'a', status: 'accepted' },
					{ id: 'b', status: 'pending' },
				],
				['b'],
			),
		).toBe(0);
	});
});
