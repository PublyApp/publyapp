/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import QueryDisplay from './query-display';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				loading: 'Loading…',
				'query-display-error-default': 'An error occurred while loading data.',
			};
			return labels[key] ?? key;
		},
	}),
}));

afterEach(cleanup);

const pendingQuery = {
	isPending: true,
	isLoading: true,
	isFetching: true,
	isError: false,
} as never;

const errorQuery = {
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: true,
	error: new Error('boom'),
} as never;

describe('QueryDisplay', () => {
	// shell F4: the default loading spinner and error fallback used to be
	// hardcoded English ("Loading" / "An error occurred while loading
	// data."); both now route through t().
	test('routes the default loading spinner aria-label through t()', () => {
		render(<QueryDisplay query={pendingQuery} />);

		expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
			'Loading…',
		);
	});

	test('routes the default error fallback text through t()', () => {
		render(<QueryDisplay query={errorQuery} />);

		expect(
			screen.getByText('An error occurred while loading data.'),
		).toBeTruthy();
	});

	test('a custom ErrorSlot still wins over the translated default', () => {
		render(
			<QueryDisplay query={errorQuery} ErrorSlot={<span>Custom error</span>} />,
		);

		expect(screen.getByText('Custom error')).toBeTruthy();
		expect(
			screen.queryByText('An error occurred while loading data.'),
		).toBeNull();
	});
});
