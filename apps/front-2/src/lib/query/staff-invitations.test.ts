import { describe, expect, test, vi } from 'vitest';

import {
	buildFindStaffInvitationsQueryParameters,
	invalidateStaffInvitations,
	STAFF_INVITATIONS_QUERY_KEY,
} from './staff-invitations';

describe('buildFindStaffInvitationsQueryParameters', () => {
	test('keeps only api-supported filters and stringifies size', () => {
		expect(
			buildFindStaffInvitationsQueryParameters({
				q: 'staff-admin',
				cursor: 'cursor-123',
				size: 50,
				sortId: 'created_at',
				sortOrder: 'desc',
				status: 'pending,accepted',
			}),
		).toEqual({
			cursor: 'cursor-123',
			limit: '50',
			sortId: 'created_at',
			sortOrder: 'desc',
			status: 'pending,accepted',
		});
	});

	test('omits empty values', () => {
		expect(
			buildFindStaffInvitationsQueryParameters({
				q: '  ',
				size: undefined,
				sortId: undefined,
				sortOrder: undefined,
				cursor: undefined,
				status: '',
			}),
		).toEqual({});
	});
});

describe('invalidateStaffInvitations', () => {
	test('invalidates the shared staff-invitations scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffInvitations({ invalidateQueries } as never);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_INVITATIONS_QUERY_KEY],
		});
	});
});
