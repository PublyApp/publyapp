/**
 * @vitest-environment jsdom
 *
 * #258 round 2: the tenant portal empty state must distinguish a user whose
 * every organization was soft-deleted from one who was never invited
 * anywhere. Both render through `TenantPortalEmptyState`; this spec pins
 * that the visible copy DIFFERS between the two situations. Paired RED
 * proof lives in `.dump/proof-red-r2.md`: on the pre-fix component both
 * arms rendered "No organizations found", so the second test failed.
 *
 * Scope (post-#1611 dedup): the "all tenants deleted" case is now covered
 * at the route level in `../tenant.test.tsx` (test "#258: renders the
 * deletion notice when every tenant was soft-deleted"), which exercises
 * the full wire — query payload → route → empty state. This file keeps
 * only the presentational case that the route test does not cover: the
 * generic empty state shown to a user who was never invited anywhere.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const EN_LABELS: TestLabelMap = {
	'no-organizations-found': 'No organizations found',
	'all-organizations-deleted-title':
		'Your organizations are no longer available',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

import { TenantPortalEmptyState } from './_tenant-picker-states';

const renderWithQueryClient = (ui: ReactNode) => {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
};

describe('TenantPortalEmptyState (#258) — generic empty arm', () => {
	afterEach(() => {
		cleanup();
	});

	test('a user who was never invited anywhere sees the generic empty message', () => {
		renderWithQueryClient(<TenantPortalEmptyState />);

		expect(screen.getByTestId('tenant-portal-empty')).toBeTruthy();
		expect(screen.getByText('No organizations found')).toBeTruthy();
		expect(
			screen.queryByText('Your organizations are no longer available'),
		).toBeNull();
		expect(screen.queryByTestId('tenant-portal-logout-button')).toBeNull();
	});
});
