import { describe, expect, test } from 'vitest';

import {
	buildAuditLogsCursorResetKey,
	parseAuditLogsActionsFilter,
	parseAuditLogsDateFilter,
	parseAuditLogsListSearchParams,
	serializeAuditLogsActionsFilter,
	serializeAuditLogsListSearchParams,
} from './_list-search-params';

describe('audit log list search params', () => {
	describe('actions CSV filter', () => {
		test('splits, trims and de-duplicates tokens', () => {
			expect(
				parseAuditLogsActionsFilter(
					'user.created, auth.succeeded, user.created',
				),
			).toEqual(['user.created', 'auth.succeeded']);
		});

		test('drops empty tokens but keeps unknown ones (backend owns the allowlist)', () => {
			expect(
				parseAuditLogsActionsFilter('user.created,,,bogus.action'),
			).toEqual(['user.created', 'bogus.action']);
		});

		test('returns an empty list for empty/null/non-string input', () => {
			expect(parseAuditLogsActionsFilter(undefined)).toEqual([]);
			expect(parseAuditLogsActionsFilter('')).toEqual([]);
			expect(parseAuditLogsActionsFilter('   ')).toEqual([]);
			expect(parseAuditLogsActionsFilter(42)).toEqual([]);
		});

		test('serializes back to a CSV string only when non-empty', () => {
			expect(
				serializeAuditLogsActionsFilter(['user.created', 'auth.succeeded']),
			).toBe('user.created,auth.succeeded');
			expect(serializeAuditLogsActionsFilter([])).toBeUndefined();
		});
	});

	describe('date filters', () => {
		test('accepts well-formed YYYY-MM-DD values', () => {
			expect(parseAuditLogsDateFilter('2026-01-31')).toBe('2026-01-31');
		});

		test('rejects malformed, impossible and non-string values', () => {
			expect(parseAuditLogsDateFilter('2026-13-01')).toBeUndefined();
			expect(parseAuditLogsDateFilter('2026-02-30')).toBeUndefined();
			expect(parseAuditLogsDateFilter('2026-1-5')).toBeUndefined();
			expect(parseAuditLogsDateFilter('01/31/2026')).toBeUndefined();
			expect(parseAuditLogsDateFilter('')).toBeUndefined();
			expect(parseAuditLogsDateFilter(42)).toBeUndefined();
		});
	});

	describe('full parse/serialize round trip', () => {
		test('maps wire snake_case to camelCase and back', () => {
			const parsed = parseAuditLogsListSearchParams({
				actions: 'user.created,auth.succeeded',
				start_date: '2026-01-01',
				end_date: '2026-01-31',
				sort_id: 'created_at',
				sort_order: 'desc',
				size: 50,
			});

			expect(parsed).toEqual({
				actions: 'user.created,auth.succeeded',
				startDate: '2026-01-01',
				endDate: '2026-01-31',
				sortId: 'created_at',
				sortOrder: 'desc',
				size: 50,
			});

			expect(serializeAuditLogsListSearchParams(parsed)).toEqual({
				actions: 'user.created,auth.succeeded',
				start_date: '2026-01-01',
				end_date: '2026-01-31',
				sort_id: 'created_at',
				sort_order: 'desc',
				size: 50,
			});
		});

		test('normalizes junk and drops empty filter keys from the wire', () => {
			const serialized = serializeAuditLogsListSearchParams(
				parseAuditLogsListSearchParams({
					actions: 'user.created,,, ',
					start_date: 'not-a-date',
					end_date: '2026-01-31',
				}),
			);

			expect(serialized).toEqual({
				actions: 'user.created',
				end_date: '2026-01-31',
			});
		});
	});

	describe('cursor reset key', () => {
		test('changes when any filter changes', () => {
			const base = buildAuditLogsCursorResetKey({
				actions: 'user.created',
				startDate: '2026-01-01',
			});

			expect(
				buildAuditLogsCursorResetKey({ actions: 'user.created' }),
			).not.toBe(base);
			expect(
				buildAuditLogsCursorResetKey({
					actions: 'user.created',
					startDate: '2026-01-01',
					endDate: '2026-01-31',
				}),
			).not.toBe(base);
			expect(
				buildAuditLogsCursorResetKey({
					actions: 'user.created',
					startDate: '2026-01-01',
				}),
			).toBe(base);
		});
	});
});
