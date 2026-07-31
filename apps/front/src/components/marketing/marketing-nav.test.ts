import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';
import enResource from '~/i18n/locales/en';
import frResource from '~/i18n/locales/fr';
import { routeTree } from '~/routeTree.gen';

import {
	MARKETING_FOOTER_COLUMNS,
	MARKETING_NAV_TRIGGERS,
	type MarketingDestination,
	type MarketingNavItem,
} from './marketing-nav';

/**
 * Every path the REAL generated route tree serves, read off a real router
 * built from `routeTree.gen` — the same tree `getRouter()` mounts in
 * production, not a hand-listed set. A marketing destination missing from
 * here would render a link the router cannot resolve, which is the failure
 * the no-dead-ends rule exists to prevent.
 */
const routePaths = new Set(
	Object.keys(
		createRouter({ routeTree, context: { queryClient: new QueryClient() } })
			.routesByPath,
	),
);

const allDestinations = (): MarketingDestination[] => [
	...MARKETING_NAV_TRIGGERS,
	...MARKETING_NAV_TRIGGERS.flatMap((trigger) =>
		trigger.columns.flatMap((column) => [...column.items]),
	),
	...MARKETING_FOOTER_COLUMNS.flatMap((column) => [...column.links]),
];

const allI18nKeys = (): string[] => [
	...MARKETING_NAV_TRIGGERS.flatMap((trigger) => [
		trigger.labelKey,
		...trigger.columns.flatMap((column) => [
			column.titleKey,
			...column.items.flatMap((item: MarketingNavItem) =>
				item.badgeKey
					? [item.labelKey, item.descriptionKey, item.badgeKey]
					: [item.labelKey, item.descriptionKey],
			),
		]),
	]),
	...MARKETING_FOOTER_COLUMNS.flatMap((column) => [
		column.titleKey,
		...column.links.map((link) => link.labelKey),
	]),
];

describe('marketing nav model', () => {
	test('the walk sees the real route tree, not an empty one', () => {
		expect(routePaths.size).toBeGreaterThan(10);
		expect(routePaths).toContain('/');
		expect(routePaths).toContain('/login');
	});

	test('every declared destination points at a path the real route tree serves', () => {
		const destinations = allDestinations().filter(
			(destination) => destination.to !== undefined,
		);

		expect(destinations.length).toBeGreaterThan(0);
		for (const destination of destinations) {
			expect(routePaths).toContain(destination.to);
		}
	});

	test('every label, description and column title resolves in both locales', () => {
		const keys = allI18nKeys();

		expect(keys.length).toBeGreaterThan(20);
		for (const key of keys) {
			expect(
				Object.hasOwn(enResource.common as Record<string, unknown>, key),
				`missing en key: ${key}`,
			).toBe(true);
			expect(
				Object.hasOwn(frResource.common as Record<string, unknown>, key),
				`missing fr key: ${key}`,
			).toBe(true);
		}
	});
});
