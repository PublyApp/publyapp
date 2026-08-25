/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';

import type {
	FindPostsForTenantResponse,
	PostDetail,
} from '@org/client-ts/models/index';

import {
	buildFindTenantPostsQueryParameters,
	toTenantPostRows,
	toTenantPostDetails,
} from './tenant-posts';

describe('tenant-posts helpers', () => {
	test('drops empty q and maps size to limit', () => {
		const params = buildFindTenantPostsQueryParameters({
			q: '  ',
			size: 20,
			sortId: 'created_at',
			sortOrder: 'desc',
		});

		expect(params).toEqual({
			sortId: 'created_at',
			sortOrder: 'desc',
			limit: '20',
		});
		expect(params.q).toBeUndefined();
	});

	test('preserves non-empty q and cursor', () => {
		const params = buildFindTenantPostsQueryParameters({
			q: 'hello',
			cursor: 'abc-123',
			size: 10,
			sortId: 'updated_at',
			sortOrder: 'asc',
		});

		expect(params.q).toBe('hello');
		expect(params.cursor).toBe('abc-123');
		expect(params.limit).toBe('10');
	});

	test('maps undefined size to undefined limit', () => {
		const params = buildFindTenantPostsQueryParameters({});
		expect(params.limit).toBeUndefined();
	});

	test('toTenantPostRows filters malformed rows and truncates no further than server preview', () => {
		const rows = toTenantPostRows({
			data: [
				{
					id: '11111111-1111-7111-8111-111111111111',
					bodyPreview: 'hello',
					status: 'draft',
					projectId: null,
					createdByUserId: '22222222-2222-7222-8222-222222222222',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					id: null,
					bodyPreview: 'no-id',
				},
				{
					id: '33333333-3333-7333-8333-333333333333',
					bodyPreview: '',
				},
			],
		} as FindPostsForTenantResponse);

		expect(rows).toHaveLength(1);
		expect(rows[0].excerpt).toBe('hello');
		expect(rows[0].id).toBe('11111111-1111-7111-8111-111111111111');
	});

	test('toTenantPostRows handles null/undefined input', () => {
		expect(toTenantPostRows(null)).toEqual([]);
		expect(toTenantPostRows(undefined)).toEqual([]);
	});

	test('toTenantPostDetails returns null for missing id or body', () => {
		expect(
			toTenantPostDetails({
				id: '11111111-1111-7111-8111-111111111111',
				body: null,
			} as PostDetail),
		).toBeNull();
		expect(
			toTenantPostDetails({
				id: null,
				body: 'has body',
			} as PostDetail),
		).toBeNull();
		expect(toTenantPostDetails(null)).toBeNull();
	});

	test('toTenantPostDetails maps fields correctly', () => {
		const details = toTenantPostDetails({
			id: '11111111-1111-7111-8111-111111111111',
			body: 'Test body',
			projectId: '22222222-2222-7222-8222-222222222222',
			status: 'draft',
			createdByUserId: '33333333-3333-7333-8333-333333333333',
			createdAt: new Date('2026-01-01T00:00:00Z'),
			updatedAt: new Date('2026-01-02T00:00:00Z'),
		} as PostDetail);

		expect(details).not.toBeNull();
		expect(details!.id).toBe('11111111-1111-7111-8111-111111111111');
		expect(details!.body).toBe('Test body');
		expect(details!.projectId).toBe('22222222-2222-7222-8222-222222222222');
		expect(details!.status).toBe('draft');
	});
});
