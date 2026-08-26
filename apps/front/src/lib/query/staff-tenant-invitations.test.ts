import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

import {
	AccountLevelObject,
	InvitationEffectiveStatusObject,
} from '@org/client-ts/models/index';
import type { StaffTenantInvitationListItem } from '@org/client-ts/models/index';

import {
	buildFindStaffTenantInvitationsQueryParameters,
	invalidateStaffTenantInvitations,
	isStaffTenantInvitationRevocable,
	STAFF_TENANT_INVITATIONS_QUERY_KEY,
	toStaffTenantInvitationRows,
} from './staff-tenant-invitations';

describe('buildFindStaffTenantInvitationsQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantInvitationsQueryParameters({
				q: ' alex ',
				status: ' pending,accepted ',
				level: ' admin,user ',
				sortId: ' expires_at ',
				sortOrder: 'asc',
				cursor: ' invitation-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'alex',
			status: 'pending,accepted',
			level: 'admin,user',
			sortId: 'expires_at',
			sortOrder: 'asc',
			cursor: 'invitation-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantInvitationsQueryParameters({
				q: '   ',
				status: undefined,
				level: ' ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('toStaffTenantInvitationRows', () => {
	test('normalizes invitation rows defensively and skips entries without usable ids', () => {
		const acceptedAt = new Date('2026-07-01T10:00:00Z');
		const createdAt = new Date('2026-06-30T08:00:00Z');
		const expiresAt = new Date('2026-07-07T18:00:00Z');

		const items: StaffTenantInvitationListItem[] = [
			{
				id: 'invite-1',
				email: ' invitee@example.com ',
				status: InvitationEffectiveStatusObject.Pending,
				scope: ' Tenant ',
				profileName: ' Owners ',
				profiles: [
					{ id: 'profile-1', name: ' Owners ' },
					{ id: 'profile-2', name: ' Reviewers ' },
				],
				accountLevel: AccountLevelObject.User,
				invitedByName: ' Alex Johnson ',
				acceptedAt,
				createdAt,
				expiresAt,
			},
			{
				id: '',
				email: 'skip@example.com',
				status: InvitationEffectiveStatusObject.Accepted,
			},
		];

		expect(toStaffTenantInvitationRows(items)).toEqual([
			{
				id: 'invite-1',
				email: 'invitee@example.com',
				status: InvitationEffectiveStatusObject.Pending,
				scope: 'Tenant',
				profileName: 'Owners',
				profiles: [
					{ id: 'profile-1', name: 'Owners' },
					{ id: 'profile-2', name: 'Reviewers' },
				],
				accountLevel: AccountLevelObject.User,
				invitedByName: 'Alex Johnson',
				acceptedAt,
				createdAt,
				expiresAt,
			},
		]);
	});

	// shell-r5-F3: a row missing a required identity (email/id/invitedByName)
	// used to be kept with a `'—'` placeholder a staff admin can't distinguish
	// from real data. It must be dropped instead — for EACH required field
	// independently, not just "all blank" at once.
	test.each([
		['email', { email: ' ' }],
		['invitedByName', { invitedByName: '' }],
	] satisfies [string, Partial<StaffTenantInvitationListItem>][])(
		'drops a row missing only %s rather than fabricating a placeholder',
		(_label, overrides) => {
			const items: StaffTenantInvitationListItem[] = [
				{
					id: 'invite-2',
					email: 'invitee@example.com',
					status: InvitationEffectiveStatusObject.Pending,
					scope: 'Tenant',
					profileName: 'Owners',
					accountLevel: AccountLevelObject.User,
					invitedByName: 'Alex Johnson',
					acceptedAt: null,
					createdAt: null,
					expiresAt: null,
					...overrides,
				},
			];

			expect(toStaffTenantInvitationRows(items)).toEqual([]);
		},
	);

	test('keeps profile-less tenant User invites with null profileName', () => {
		expect(
			toStaffTenantInvitationRows([
				{
					id: 'invite-user-no-profile',
					email: 'user-no-profile@example.com',
					status: InvitationEffectiveStatusObject.Pending,
					scope: ' Tenant ',
					accountLevel: AccountLevelObject.User,
					invitedByName: 'Alex Johnson',
					acceptedAt: null,
					createdAt: null,
					expiresAt: null,
				},
			]),
		).toEqual([
			{
				id: 'invite-user-no-profile',
				email: 'user-no-profile@example.com',
				status: InvitationEffectiveStatusObject.Pending,
				scope: 'Tenant',
				profileName: null,
				profiles: [],
				accountLevel: AccountLevelObject.User,
				invitedByName: 'Alex Johnson',
				acceptedAt: null,
				createdAt: null,
				expiresAt: null,
			},
		]);
	});

	test('keeps profile-less tenant Admin invites with null profileName', () => {
		expect(
			toStaffTenantInvitationRows([
				{
					id: 'invite-admin-no-profile',
					email: 'admin-no-profile@example.com',
					status: InvitationEffectiveStatusObject.Pending,
					scope: ' Tenant ',
					accountLevel: AccountLevelObject.Admin,
					invitedByName: 'Alex Johnson',
					acceptedAt: null,
					createdAt: null,
					expiresAt: null,
				},
			]),
		).toEqual([
			{
				id: 'invite-admin-no-profile',
				email: 'admin-no-profile@example.com',
				status: InvitationEffectiveStatusObject.Pending,
				scope: 'Tenant',
				profileName: null,
				profiles: [],
				accountLevel: AccountLevelObject.Admin,
				acceptedAt: null,
				invitedByName: 'Alex Johnson',
				createdAt: null,
				expiresAt: null,
			},
		]);
	});

	test('keeps profile-based invites unchanged', () => {
		expect(
			toStaffTenantInvitationRows([
				{
					id: 'invite-profile-based',
					email: 'profile-based@example.com',
					status: InvitationEffectiveStatusObject.Accepted,
					scope: 'Tenant',
					profileName: 'Owners',
					accountLevel: AccountLevelObject.User,
					invitedByName: 'Alex Johnson',
					acceptedAt: null,
					createdAt: null,
					expiresAt: null,
				},
			]),
		).toEqual([
			{
				id: 'invite-profile-based',
				email: 'profile-based@example.com',
				status: InvitationEffectiveStatusObject.Accepted,
				scope: 'Tenant',
				profileName: 'Owners',
				profiles: [],
				accountLevel: AccountLevelObject.User,
				invitedByName: 'Alex Johnson',
				acceptedAt: null,
				createdAt: null,
				expiresAt: null,
			},
		]);
	});

	test('an empty list stays empty (no fabricated rows)', () => {
		expect(toStaffTenantInvitationRows([])).toEqual([]);
		expect(toStaffTenantInvitationRows(null)).toEqual([]);
		expect(toStaffTenantInvitationRows(undefined)).toEqual([]);
	});
});

describe('isStaffTenantInvitationRevocable', () => {
	test('returns true only for pending invitations', () => {
		expect(
			isStaffTenantInvitationRevocable({
				status: InvitationEffectiveStatusObject.Pending,
			}),
		).toBe(true);

		expect(
			isStaffTenantInvitationRevocable({
				status: InvitationEffectiveStatusObject.Accepted,
			}),
		).toBe(false);

		expect(
			isStaffTenantInvitationRevocable({
				status: null,
			}),
		).toBe(false);
	});
});

describe('invalidateStaffTenantInvitations', () => {
	test('invalidates the shared staff-tenant-invitations scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffTenantInvitations({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_TENANT_INVITATIONS_QUERY_KEY],
		});
	});
});
