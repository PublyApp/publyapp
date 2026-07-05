import { describe, expect, test } from 'vitest';

import {
	filterInvitationRows,
	parseInvitationListSearchParams,
	serializeInvitationListSearchParams,
} from './list-helpers';

describe('parseInvitationListSearchParams', () => {
	test('parses shared table params and normalizes known invitation statuses', () => {
		expect(
			parseInvitationListSearchParams({
				q: ' invited ',
				sort_id: ' created_at ',
				sort_order: ' desc ',
				cursor: ' cursor-123 ',
				size: ' 25 ',
				status: ' pending, accepted , invalid , pending ',
			}),
		).toEqual({
			q: 'invited',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'cursor-123',
			size: 25,
			status: 'pending,accepted',
		});
	});

	test('drops empty status values', () => {
		expect(
			parseInvitationListSearchParams({
				status: '  ',
			}),
		).toEqual({});
	});
});

describe('serializeInvitationListSearchParams', () => {
	test('serializes snake_case params and preserves normalized status csv', () => {
		expect(
			serializeInvitationListSearchParams({
				q: 'invited',
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: 'cursor-123',
				size: 25,
				status: ' pending,accepted,invalid ',
			}),
		).toEqual({
			q: 'invited',
			sort_id: 'created_at',
			sort_order: 'desc',
			cursor: 'cursor-123',
			size: '25',
			status: 'pending,accepted',
		});
	});
});

describe('filterInvitationRows', () => {
	test('matches email, profile name, inviter, and status text case-insensitively', () => {
		const rows = [
			{
				id: 'one',
				email: 'pending@example.com',
				profileName: 'Admins',
				invitedByName: 'Owner User',
				status: 'pending',
			},
			{
				id: 'two',
				email: 'accepted@example.com',
				profileName: 'Editors',
				invitedByName: 'Staff Admin',
				status: 'accepted',
			},
		];

		expect(filterInvitationRows(rows, 'admins')).toEqual([rows[0]]);
		expect(filterInvitationRows(rows, 'staff admin')).toEqual([rows[1]]);
		expect(filterInvitationRows(rows, 'PENDING')).toEqual([rows[0]]);
		expect(filterInvitationRows(rows, 'accepted@example.com')).toEqual([
			rows[1],
		]);
	});
});
