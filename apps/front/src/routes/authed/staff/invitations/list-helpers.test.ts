import { describe, expect, test } from 'vitest';

import {
	getInvitationStatusLabelKey,
	parseInvitationAccountLevelFilter,
	parseInvitationListSearchParams,
	serializeInvitationAccountLevelFilter,
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
		).toEqual({ status: undefined });
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
			size: 25,
			status: 'pending,accepted',
		});
	});
});

describe('getInvitationStatusLabelKey', () => {
	test('maps every known status to a translation key', () => {
		expect(getInvitationStatusLabelKey('pending')).toBe(
			'staff-invitations:invitation-status-pending',
		);
		expect(getInvitationStatusLabelKey('accepted')).toBe(
			'staff-invitations:invitation-status-accepted',
		);
		expect(getInvitationStatusLabelKey('expired')).toBe(
			'staff-invitations:invitation-status-expired',
		);
		expect(getInvitationStatusLabelKey('revoked')).toBe(
			'staff-invitations:invitation-status-revoked',
		);
		expect(getInvitationStatusLabelKey('unknown')).toBe('unknown');
	});
});

describe('invitation account-level filters', () => {
	test('parses known comma-separated levels case-insensitively and dedupes', () => {
		expect(
			parseInvitationAccountLevelFilter(' Admin, bogus, user, ADMIN '),
		).toEqual(['admin', 'user']);
	});

	test('serializes one or both levels and resets an empty selection', () => {
		expect(serializeInvitationAccountLevelFilter(['admin'])).toBe('admin');
		expect(serializeInvitationAccountLevelFilter(['admin', 'user'])).toBe(
			'admin,user',
		);
		expect(serializeInvitationAccountLevelFilter([])).toBeUndefined();
	});
});
