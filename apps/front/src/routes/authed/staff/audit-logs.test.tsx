import { describe, expect, test } from 'vitest';

import {
	buildAuditActionCatalog,
	buildAuditLogFilters,
	resolveAuditLogSelection,
} from './audit-logs/_audit-log-history-filters';

const t = (key: string): string => key;

/** A slice of the backend action registry, enough to cover the categories and
 * the sensitive subset. */
const ACTIONS = [
	'auth.login.succeeded',
	'auth.login.failed',
	'impersonation.started',
	'job.dead_letter.requeued',
	'tenant.created',
	'tenant.suspended',
	'tenant.user.suspended',
];

const catalog = buildAuditActionCatalog(ACTIONS);

describe('staff audit log history filters', () => {
	test('lists only the categories the registry actually populates', () => {
		const filters = buildAuditLogFilters({ t, catalog, search: {} });
		const categories = filters.find((filter) => filter.key === 'category');

		expect(categories?.panel).toBe(true);
		expect(categories?.choices.map((choice) => choice.value)).toEqual([
			'auth',
			'tenant',
			'member',
			'impersonation',
			'job',
		]);
	});

	test('offers the period presets, and the custom range only when deep-linked', () => {
		const withoutRange = buildAuditLogFilters({ t, catalog, search: {} });
		expect(
			withoutRange
				.find((filter) => filter.key === 'period')
				?.choices.map((choice) => choice.value),
		).toEqual(['today', 'week', 'month']);

		const withRange = buildAuditLogFilters({
			t,
			catalog,
			search: { startDate: '2026-10-01', endDate: '2026-10-15' },
		});
		const custom = withRange
			.find((filter) => filter.key === 'period')
			?.choices.find((choice) => choice.value === 'custom');
		expect(custom?.label).toBe('01/10/2026 – 15/10/2026');
	});

	test('a category the facets omit is a real 0, not an unknown count', () => {
		const withFacets = buildAuditLogFilters({
			t,
			catalog,
			search: {},
			categoryCounts: { tenant: 4 },
		});
		const counts = withFacets
			.find((filter) => filter.key === 'category')
			?.choices.map((choice) => choice.count);
		expect(counts).toEqual([0, 4, 0, 0, 0]);

		const withoutFacets = buildAuditLogFilters({ t, catalog, search: {} });
		expect(
			withoutFacets
				.find((filter) => filter.key === 'category')
				?.choices.every((choice) => choice.count === null),
		).toBe(true);
	});

	test('offers the sensitive shortcut only when the registry has one', () => {
		expect(
			buildAuditLogFilters({ t, catalog, search: {} }).some(
				(filter) => filter.key === 'sensitivity',
			),
		).toBe(true);
		expect(
			buildAuditLogFilters({
				t,
				catalog: buildAuditActionCatalog(['job.dead_letter.requeued']),
				search: {},
			}).some((filter) => filter.key === 'sensitivity'),
		).toBe(false);
	});

	test('turns the selected categories into the server action list', () => {
		const selection = resolveAuditLogSelection({
			catalog,
			categories: ['tenant'],
			sensitivity: false,
		});

		expect(selection.actions).toBe('tenant.created,tenant.suspended');
		expect(selection.impossible).toBe(false);
	});

	test('intersects the category and sensitivity dimensions', () => {
		const selection = resolveAuditLogSelection({
			catalog,
			categories: ['tenant'],
			sensitivity: true,
		});

		expect(selection.actions).toBe('tenant.suspended');
	});

	test('flags an empty intersection instead of querying the whole history', () => {
		const selection = resolveAuditLogSelection({
			catalog,
			categories: ['job'],
			sensitivity: true,
		});

		expect(selection.impossible).toBe(true);
		expect(selection.actions).toBeUndefined();
	});

	test('sends no action filter when nothing is selected', () => {
		const selection = resolveAuditLogSelection({
			catalog,
			categories: [],
			sensitivity: false,
		});

		expect(selection.actions).toBeUndefined();
		expect(selection.impossible).toBe(false);
	});
});
