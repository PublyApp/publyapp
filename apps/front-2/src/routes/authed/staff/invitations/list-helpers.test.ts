import { describe, expect, test } from 'vitest';

import {
	getInvitationStatusLabelKey,
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
			size: '25',
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
