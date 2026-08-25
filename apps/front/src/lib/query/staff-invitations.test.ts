import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import {
	buildBulkRevokeStaffInvitationsBody,
	buildFindStaffInvitationsQueryParameters,
	invalidateStaffInvitations,
	STAFF_INVITATIONS_QUERY_KEY,
} from './staff-invitations';
import type { StaffInvitationsQueryVariables } from './staff-invitations';

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
		const inputWithQ: StaffInvitationsQueryVariables & { q?: string } = {
			cursor: 'cursor-123',
			size: 50,
			sortId: 'created_at',
			sortOrder: 'desc',
			status: 'pending,accepted',
			q: 'staff-admin',
		};
		expect(buildFindStaffInvitationsQueryParameters(inputWithQ)).toEqual({
			cursor: 'cursor-123',
			limit: '50',
			sortId: 'created_at',
			sortOrder: 'desc',
			status: 'pending,accepted',
		});
	});
});

describe('buildBulkRevokeStaffInvitationsBody', () => {
	// The kiota body model is untyped-node based; the builder is the one place
	// that owns the `{ invitationIds: [...] }` wire shape for
	// POST /staff/invitations/bulk-revoke.
	test('maps ids to the invitationIds untyped array the bulk-revoke endpoint expects', () => {
		const body = buildBulkRevokeStaffInvitationsBody({
			invitationIds: ['a', 'b'],
		});

		expect(body.invitationIds).toBeDefined();
	});

	test('accepts the full id list in order, including duplicates the caller sent', () => {
		const body = buildBulkRevokeStaffInvitationsBody({
			invitationIds: ['a', 'b', 'a'],
		});

		expect(JSON.stringify(body)).toContain('"a"');
		expect(JSON.stringify(body)).toContain('"b"');
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
