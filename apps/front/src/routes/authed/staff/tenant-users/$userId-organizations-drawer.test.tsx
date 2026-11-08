/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useGlobalTenantUsersPickerQuery: vi.fn(),
	linkMutateAsync: vi.fn(),
}));

vi.mock('~/lib/query/staff-global-tenant-users', async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import('~/lib/query/staff-global-tenant-users')
		>();
	return {
		...actual,
		useGlobalTenantUsersPickerQuery: mocks.useGlobalTenantUsersPickerQuery,
		useLinkGlobalTenantUserCompaniesMutation: () => ({
			mutateAsync: mocks.linkMutateAsync,
			isPending: false,
		}),
	};
});

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { LinkCompaniesDrawerHost } from './$userId-organizations-drawer';

const pickerOf = (rows: unknown[]) => ({
	data: { data: rows, nextCursor: null },
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: false,
	error: null,
	refetch: vi.fn(),
});

// A failed *refetch* keeps the last good data (TanStack v5 flips
// `status: 'error'` without clearing `data`); the drawer must keep showing
// the company rows instead of collapsing to the error paragraph alone.
const staleErrorPicker = (rows: unknown[]) => ({
	...pickerOf(rows),
	isError: true,
	error: { status: 503, title: 'Service Unavailable', detail: 'x' },
});

const renderHost = () =>
	render(
		createElement(
			QueryClientProvider,
			{ client: new QueryClient() },
			createElement(LinkCompaniesDrawerHost, {
				userId: 'user-1',
				isOpen: true,
				onOpenChange: vi.fn(),
			}),
		),
	);

beforeEach(() => {
	mocks.useGlobalTenantUsersPickerQuery.mockReset();
});

afterEach(() => {
	cleanup();
});

describe('LinkCompaniesDrawerHost companies picker', () => {
	test('keeps the loaded company rows when a background refetch fails', () => {
		mocks.useGlobalTenantUsersPickerQuery.mockReturnValue(
			staleErrorPicker([{ id: 't1', name: 'Acme', logoUrl: null }]),
		);

		renderHost();

		expect(screen.getByTestId('link-companies-options')).toBeTruthy();
		expect(screen.getByText('Acme')).toBeTruthy();
	});

	test('shows the no-items message when the query resolves with zero companies', () => {
		mocks.useGlobalTenantUsersPickerQuery.mockReturnValue(pickerOf([]));

		renderHost();

		expect(screen.getByText('no-items-found')).toBeTruthy();
		expect(screen.getByTestId('link-companies-options')).toBeTruthy();
	});

	// F-M1 (#2341): in the held-data + refetch-error state the rows must
	// reconcile IN PLACE. Passing an inline arrow as ErrorSlot made QueryDisplay
	// mount a fresh component type on every host render, so ticking a row (which
	// re-renders the host through setSelectedTenantIds) destroyed and rebuilt
	// the whole subtree — the just-focused checkbox lost the DOM node and focus.
	test('keeps the same focused row node when a tick re-renders a held-data refetch error', () => {
		mocks.useGlobalTenantUsersPickerQuery.mockReturnValue(
			staleErrorPicker([{ id: 't1', name: 'Acme', logoUrl: null }]),
		);
		renderHost();

		const checkbox = screen.getByRole('checkbox', { name: 'Acme' });
		checkbox.focus();
		expect(document.activeElement).toBe(checkbox);

		// Ticking the row re-renders the host (setSelectedTenantIds).
		fireEvent.click(checkbox);

		// The very same DOM node must survive that re-render and keep focus.
		expect(screen.getByRole('checkbox', { name: 'Acme' })).toBe(checkbox);
		expect(document.activeElement).toBe(checkbox);
	});
});
