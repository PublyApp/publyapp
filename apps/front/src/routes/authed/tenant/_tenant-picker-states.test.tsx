/**
 * @vitest-environment jsdom
 *
 * #258 round 2: the tenant portal empty state must distinguish a user whose
 * every organization was soft-deleted from one who was never invited
 * anywhere. Both render through `TenantPortalEmptyState`; this spec pins
 * that the visible copy DIFFERS between the two situations. Paired RED
 * proof lives in `.dump/proof-red-r2.md`: on the pre-fix component both
 * arms rendered "No organizations found", so the second test failed.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const EN_LABELS: TestLabelMap = {
	'no-organizations-found': 'No organizations found',
	'all-organizations-deleted-title':
		'Your organizations are no longer available',
	'all-organizations-deleted-description':
		'All of your organizations have been removed by their administrators. If you believe this is a mistake, contact support.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { TenantPortalEmptyState } from './_tenant-picker-states';

describe('TenantPortalEmptyState (#258)', () => {
	afterEach(() => {
		cleanup();
	});

	test('a user who was never invited anywhere sees the generic empty message', () => {
		render(<TenantPortalEmptyState />);

		expect(screen.getByTestId('tenant-portal-empty')).toBeTruthy();
		expect(screen.getByText('No organizations found')).toBeTruthy();
		expect(
			screen.queryByText('Your organizations are no longer available'),
		).toBeNull();
	});

	test('a user whose every tenant was soft-deleted sees the deletion message instead', () => {
		render(<TenantPortalEmptyState hasDeletedTenants />);

		// Same surface testid as the generic case (stable contract for the
		// e2e follow-up #1511) — the MESSAGE is what distinguishes the two.
		expect(screen.getByTestId('tenant-portal-empty')).toBeTruthy();
		expect(
			screen.getByText('Your organizations are no longer available'),
		).toBeTruthy();
		expect(
			screen.getByText(
				/All of your organizations have been removed by their administrators/,
			),
		).toBeTruthy();
		expect(screen.queryByText('No organizations found')).toBeNull();
	});
});
