import { describe, expect, it } from 'vitest';
import type { StaffProfileRow } from '~/lib/query/staff-profiles';

import { getDeletableProfileIds } from './_profiles-bulk-helpers';

const row = (id: string): StaffProfileRow => ({
	id,
	name: `Profile ${id}`,
	description: null,
	userAccountCount: null,
	icon: 'briefcase',
	iconTone: 'neutral',
});

describe('#1386 profile bulk-delete eligibility', () => {
	it('ItShouldKeepEverySelectedProfileResolvableFromLoadedRows', () => {
		const rows = [row('p1'), row('p2')];
		const selection = { p1: true, p2: true };

		expect(getDeletableProfileIds(rows, selection)).toEqual(['p1', 'p2']);
	});

	it('ItShouldNotBlockOnAssignedMembers', () => {
		const rows = [{ ...row('p1'), userAccountCount: 12 }];
		const selection = { p1: true };

		expect(getDeletableProfileIds(rows, selection)).toEqual(['p1']);
	});

	it('ItShouldScopeOutSelectedIdsAbsentFromTheLoadedPage', () => {
		const rows = [row('p1')];
		const selection = { p1: true, ghost: true };

		expect(getDeletableProfileIds(rows, selection)).toEqual(['p1']);
	});
});
