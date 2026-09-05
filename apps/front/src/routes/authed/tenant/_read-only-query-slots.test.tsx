import type { QueryObserverResult } from '@tanstack/react-query';
/**
 * Issue #2043 — `TenantReadOnlyCardError` had no `error` prop at all
 * (only `Pick<UseQueryResult, 'refetch'>`), so the shared card had no
 * way to distinguish a 404 (no retry) from a 500 (retry). The fix adds an
 * optional `error` prop; these tests pin the two paths while preserving the
 * direct retry callback landed on develop.
 *
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ServerFailure } from '~/lib/server/server-failure';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const EN_LABELS: TestLabelMap = {
	'failed-to-load-organization': 'Failed to load organization',
	'failed-to-load-organization-description': 'Try again later.',
	retry: 'Retry',
	'common:retry': 'Retry',
	'common:title': 'Title',
	'common:description': 'Description',
	'error-403-code': '403 — Forbidden',
	'no-access-title': "You don't have access",
	'forbidden-description': 'The page is restricted.',
	'error-404-code': '404 — Not Found',
	'page-not-found': 'Page not found',
	'not-found-sentence': 'The page could not be found.',
	'error-500-code': '500 — Server Error',
	'error-500-title': 'Internal Server Error',
	'error-500-description': 'Something went wrong on our end.',
	'query-display-error-cause-unknown':
		"We couldn't determine what went wrong. Try again in a moment.",
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

import { TenantReadOnlyCardError } from './_read-only-query-slots';

// `refetch` is only invoked inside the retry button click handler. Shaped
// against the real result so the slot's Pick constraint is type-checked.
const stubQuery = {
	refetch: () => Promise.resolve({} as QueryObserverResult),
};

describe('TenantReadOnlyCardError (#2043)', () => {
	afterEach(() => {
		cleanup();
	});

	test('invokes a direct retry callback without fabricating a query result', () => {
		const onRetry = vi.fn();

		render(
			<TenantReadOnlyCardError
				onRetry={onRetry}
				titleKey="common:title"
				descriptionKey="common:description"
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onRetry).toHaveBeenCalledOnce();
	});

	test('renders the 404 cause and hides the retry button when the query failed with a not-found error', () => {
		const error = new ServerFailure({
			responseStatusCode: 404,
			status: 404,
			title: 'Not Found',
			detail: 'The organization was deleted.',
			translationKey: 'organization-not-found',
		});

		render(
			<TenantReadOnlyCardError
				query={stubQuery}
				titleKey="failed-to-load-organization"
				descriptionKey="failed-to-load-organization-description"
				error={error}
				testId="tenant-card-error-404"
			/>,
		);

		expect(screen.getByTestId('tenant-card-error-404')).toBeTruthy();
		expect(screen.getByText('404 — Not Found')).toBeTruthy();
		expect(screen.getByText('Page not found')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
	});

	test('renders the 500 cause and keeps the retry button when the query failed with a server error', () => {
		const error = new ServerFailure({
			responseStatusCode: 500,
			status: 500,
			title: 'Internal Server Error',
			detail: 'Trace id: abc',
			translationKey: 'request-failed',
		});

		render(
			<TenantReadOnlyCardError
				query={stubQuery}
				titleKey="failed-to-load-organization"
				descriptionKey="failed-to-load-organization-description"
				error={error}
				testId="tenant-card-error-500"
			/>,
		);

		expect(screen.getByTestId('tenant-card-error-500')).toBeTruthy();
		expect(screen.getByText('500 — Server Error')).toBeTruthy();
		expect(screen.getByText('Internal Server Error')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});

	test('backward compatible — still renders the supplied titleKey + Retry when no error is provided', () => {
		render(
			<TenantReadOnlyCardError
				query={stubQuery}
				titleKey="failed-to-load-organization"
				descriptionKey="failed-to-load-organization-description"
				testId="tenant-card-error-legacy"
			/>,
		);

		expect(screen.getByText('Failed to load organization')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});
});
