import { describe, expect, it } from 'vitest';

import { getDeletableProfileIds } from './_profiles-bulk-helpers';

describe('#1386 profile bulk-delete eligibility', () => {
	it('ItShouldKeepEverySelectedProfileWhenNoRowIsDefault', () => {
		const rows = [
			{ id: 'p1', name: 'Alpha', userAccountCount: 3 },
			{ id: 'p2', name: 'Beta', userAccountCount: null },
		];
		const selection = { p1: true, p2: true };

		expect(getDeletableProfileIds(rows, selection)).toEqual(['p1', 'p2']);
	});

	it('ItShouldDropDefaultProfilesFromTheDeletableScope', () => {
		const rows = [
			{ id: 'p1', name: 'Alpha', isDefault: false },
			{ id: 'p2', name: 'System', isDefault: true },
		];
		const selection = { p1: true, p2: true };

		expect(getDeletableProfileIds(rows, selection)).toEqual(['p1']);
	});

	it('ItShouldTreatUnknownRowsAsNonDeletable', () => {
		const rows = [{ id: 'p1', name: 'Alpha' }];
		const selection = { p1: true, ghost: true };

		expect(getDeletableProfileIds(rows, selection)).toEqual(['p1']);
	});
});
