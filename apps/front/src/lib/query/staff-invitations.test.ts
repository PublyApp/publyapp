import type { QueryClient } from '@tanstack/react-query';
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
				size: undefined,
				sortId: undefined,
				sortOrder: undefined,
				cursor: undefined,
				status: '',
			}),
		).toEqual({});
	});

	// users-auth-r6-F2: the variables type no longer has a `q` field at all —
	// this pins that a caller cannot smuggle one through even via an `as`
	// cast/spread, since the builder only ever reads the fields it knows.
	test('drops an unsupported q field even if present on the input object', () => {
		expect(
			buildFindStaffInvitationsQueryParameters({
				cursor: 'cursor-123',
				size: 50,
				sortId: 'created_at',
				sortOrder: 'desc',
				status: 'pending,accepted',
				...({ q: 'staff-admin' } as object),
			}),
		).toEqual({
			cursor: 'cursor-123',
			limit: '50',
			sortId: 'created_at',
			sortOrder: 'desc',
			status: 'pending,accepted',
		});
	});
});

describe('invalidateStaffInvitations', () => {
	test('invalidates the shared staff-invitations scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffInvitations({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_INVITATIONS_QUERY_KEY],
		});
	});
});
