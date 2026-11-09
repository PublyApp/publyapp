import { describe, expect, test } from 'vitest';

import {
	auditLogPeriodStart,
	buildAuditLogsCursorResetKey,
	parseAuditLogCategories,
	parseAuditLogsDateFilter,
	parseAuditLogsListSearchParams,
	selectAuditActorFilter,
	selectAuditSearchFilter,
	serializeAuditLogCategories,
	serializeAuditLogsListSearchParams,
} from './_list-search-params';

describe('audit log list search params', () => {
	describe('category CSV filter', () => {
		test('splits, trims and de-duplicates known categories', () => {
			expect(parseAuditLogCategories('auth, tenant, auth')).toEqual([
				'auth',
				'tenant',
			]);
		});

		test('drops unknown ids and empty tokens (closed front vocabulary)', () => {
			expect(parseAuditLogCategories('auth,,bogus,tenant')).toEqual([
				'auth',
				'tenant',
			]);
		});

		test('returns an empty list for empty/null/non-string input', () => {
			expect(parseAuditLogCategories(undefined)).toEqual([]);
			expect(parseAuditLogCategories('')).toEqual([]);
			expect(parseAuditLogCategories('   ')).toEqual([]);
			expect(parseAuditLogCategories(42)).toEqual([]);
		});

		test('serializes back to a CSV string only when non-empty', () => {
			expect(serializeAuditLogCategories(['auth', 'tenant'])).toBe(
				'auth,tenant',
			);
			expect(serializeAuditLogCategories([])).toBeUndefined();
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

	describe('relative period', () => {
		test('accepts only the three presets', () => {
			expect(parseAuditLogsListSearchParams({ period: 'today' }).period).toBe(
				'today',
			);
			expect(parseAuditLogsListSearchParams({ period: 'week' }).period).toBe(
				'week',
			);
			expect(parseAuditLogsListSearchParams({ period: 'month' }).period).toBe(
				'month',
			);
			expect(
				parseAuditLogsListSearchParams({ period: 'year' }).period,
			).toBeUndefined();
		});

		test('maps each preset to its inclusive start date', () => {
			const now = new Date(2026, 9, 27, 15, 30);
			expect(auditLogPeriodStart('today', now)).toBe('2026-10-27');
			expect(auditLogPeriodStart('week', now)).toBe('2026-10-21');
			expect(auditLogPeriodStart('month', now)).toBe('2026-09-28');
		});
	});

	describe('sensitivity', () => {
		test('only the sensitive value survives parsing', () => {
			expect(
				parseAuditLogsListSearchParams({ sensitivity: 'sensitive' })
					.sensitivity,
			).toBe('sensitive');
			expect(
				parseAuditLogsListSearchParams({ sensitivity: 'normal' }).sensitivity,
			).toBeUndefined();
		});
	});

	describe('full parse/serialize round trip', () => {
		test('maps wire snake_case to camelCase and back', () => {
			const parsed = parseAuditLogsListSearchParams({
				category: 'auth,tenant',
				period: 'week',
				sensitivity: 'sensitive',
				sort_id: 'created_at',
				sort_order: 'desc',
				size: 50,
			});

			expect(parsed).toEqual({
				category: 'auth,tenant',
				period: 'week',
				sensitivity: 'sensitive',
				startDate: undefined,
				endDate: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				size: 50,
			});

			expect(serializeAuditLogsListSearchParams(parsed)).toEqual({
				category: 'auth,tenant',
				period: 'week',
				sensitivity: 'sensitive',
				sort_id: 'created_at',
				sort_order: 'desc',
				size: 50,
			});
		});

		test('keeps a deep-linked custom range when no preset is set', () => {
			const parsed = parseAuditLogsListSearchParams({
				start_date: '2026-10-01',
				end_date: '2026-10-15',
			});

			expect(parsed.startDate).toBe('2026-10-01');
			expect(parsed.endDate).toBe('2026-10-15');
			expect(serializeAuditLogsListSearchParams(parsed).start_date).toBe(
				'2026-10-01',
			);
		});
	});

	describe('unknown actor facet', () => {
		test('parses and serialises the null-actor filter', () => {
			const parsed = parseAuditLogsListSearchParams({
				unknown_actor: 'true',
			});
			expect(parsed.unknownActor).toBe(true);
			expect(serializeAuditLogsListSearchParams(parsed).unknown_actor).toBe(
				'true',
			);
			expect(
				serializeAuditLogsListSearchParams(parseAuditLogsListSearchParams({}))
					.unknown_actor,
			).toBeUndefined();
		});

		test('the « (unknown) » bucket filters on a null actor, not on its name', () => {
			expect(
				selectAuditActorFilter({ userId: null, name: '(unknown)' }, {}),
			).toEqual({ q: undefined, unknownActor: true });
		});

		test('clicking the active bucket clears the filter', () => {
			expect(
				selectAuditActorFilter(
					{ userId: null, name: '(unknown)' },
					{ unknownActor: true },
				),
			).toEqual({ q: undefined, unknownActor: undefined });
		});

		test('a known actor is still searched by name', () => {
			expect(
				selectAuditActorFilter(
					{ userId: 'a1', name: 'Ada Lovelace' },
					{ unknownActor: true },
				),
			).toEqual({ q: 'Ada Lovelace', unknownActor: undefined });
		});

		test('typing a search clears the actor-facet filter', () => {
			expect(selectAuditSearchFilter('ada')).toEqual({
				q: 'ada',
				unknownActor: undefined,
			});
		});
	});

	describe('cursor reset scope', () => {
		test('changes on any filter change', () => {
			const base = parseAuditLogsListSearchParams({
				category: 'auth',
				period: 'week',
			});
			const resetKey = buildAuditLogsCursorResetKey(base);

			expect(buildAuditLogsCursorResetKey(base)).toBe(resetKey);
			expect(
				buildAuditLogsCursorResetKey(
					parseAuditLogsListSearchParams({
						category: 'tenant',
						period: 'week',
					}),
				),
			).not.toBe(resetKey);
			expect(
				buildAuditLogsCursorResetKey(
					parseAuditLogsListSearchParams({ category: 'auth', period: 'month' }),
				),
			).not.toBe(resetKey);
			expect(
				buildAuditLogsCursorResetKey(
					parseAuditLogsListSearchParams({
						category: 'auth',
						sensitivity: 'sensitive',
					}),
				),
			).not.toBe(resetKey);
			expect(
				buildAuditLogsCursorResetKey(
					parseAuditLogsListSearchParams({ unknown_actor: 'true' }),
				),
			).not.toBe(resetKey);
		});
	});
});
