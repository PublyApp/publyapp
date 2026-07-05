import { describe, expect, test } from 'vitest';

import type { InvitationListItem } from '@org/client-ts/src/models/index.js';

import {
	buildFindStaffTenantInvitationsQueryParameters,
	toStaffTenantInvitationRows,
} from './staff-tenant-invitations';

describe('buildFindStaffTenantInvitationsQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantInvitationsQueryParameters({
				q: ' alex ',
				status: ' pending,accepted ',
				sortId: ' expires_at ',
				sortOrder: 'asc',
				cursor: ' invitation-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'alex',
			status: 'pending,accepted',
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
				status: ' ',
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

		const items: InvitationListItem[] = [
			{
				id: 'invite-1' as never,
				email: ' invitee@example.com ',
				status: ' Pending ',
				scope: ' Tenant ',
				profileName: ' Owners ',
				invitedByName: ' Alex Johnson ',
				acceptedAt,
				createdAt,
				expiresAt,
			},
			{
				id: '' as never,
				email: 'skip@example.com',
				status: 'Accepted',
			},
			{
				id: 'invite-2' as never,
				email: ' ',
				status: ' ',
				scope: null,
				profileName: ' ',
				invitedByName: null,
				acceptedAt: null,
				createdAt: null,
				expiresAt: null,
			},
		];

		expect(toStaffTenantInvitationRows(items)).toEqual([
			{
				id: 'invite-1',
				email: 'invitee@example.com',
				status: 'Pending',
				scope: 'Tenant',
				profileName: 'Owners',
				invitedByName: 'Alex Johnson',
				acceptedAt,
				createdAt,
				expiresAt,
			},
			{
				id: 'invite-2',
				email: '—',
				status: null,
				scope: null,
				profileName: '—',
				invitedByName: '—',
				acceptedAt: null,
				createdAt: null,
				expiresAt: null,
			},
		]);
	});
});
