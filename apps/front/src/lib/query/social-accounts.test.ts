import { describe, expect, it } from 'vitest';

import { toSocialAccountRows } from './social-accounts';

describe('toSocialAccountRows', () => {
	it('ItShouldMapWireStatusToSpecTonesGreenOrangeGrey', () => {
		const rows = toSocialAccountRows({
			// Real C2 wrapper shape: CursorPaginatedResult serialises as { data, nextCursor }.
			data: [
				{
					id: 'a1',
					provider: 'bluesky',
					externalAccountId: 'did:plc:a1',
					displayHandle: '@team.bsky.social',
					status: 'active',
					credentialType: 'app_password',
					lastSuccessAt: '2026-08-25T10:00:00Z',
					lastError: null,
					projectIds: [],
				},
				{
					id: 'a2',
					provider: 'bluesky',
					externalAccountId: 'did:plc:a2',
					displayHandle: '@old.bsky.social',
					status: 'needs_reconnect',
					credentialType: 'app_password',
					lastSuccessAt: null,
					lastError: 'Invalid credentials',
					projectIds: ['p1'],
				},
				{
					id: 'a3',
					provider: 'bluesky',
					externalAccountId: 'did:plc:a3',
					displayHandle: '@gone.bsky.social',
					status: 'revoked',
					credentialType: 'app_password',
					lastSuccessAt: null,
					lastError: null,
					projectIds: [],
				},
			],
			nextCursor: null,
		});

		expect(rows.map((row) => row.tone)).toEqual([
			'success',
			'warning',
			'neutral',
		]);
		expect(rows[0]?.statusLabelKey).toBe('settings:status-active');
		expect(rows[1]?.statusLabelKey).toBe('settings:status-needs-reconnect');
		expect(rows[1]?.lastSuccessAt).toBeNull();
		expect(rows[1]?.projectIds).toEqual(['p1']);
		expect(rows[2]?.statusLabelKey).toBe('settings:status-revoked');
	});

	it('ItShouldReturnEmptyArrayForMissingResponse', () => {
		expect(toSocialAccountRows(undefined)).toEqual([]);
		expect(toSocialAccountRows(null)).toEqual([]);
	});

	it('ItShouldParseLastSuccessAtIntoADate', () => {
		const rows = toSocialAccountRows({
			data: [
				{
					id: 'a1',
					provider: 'bluesky',
					externalAccountId: 'did:plc:x',
					displayHandle: '@x.bsky.social',
					status: 'active',
					credentialType: 'app_password',
					lastSuccessAt: '2026-01-02T03:04:05Z',
					lastError: null,
					projectIds: [],
				},
			],
			nextCursor: null,
		});

		expect(rows[0]?.lastSuccessAt).toBeInstanceOf(Date);
		expect((rows[0]?.lastSuccessAt as Date).toISOString()).toBe(
			'2026-01-02T03:04:05.000Z',
		);
	});
});
