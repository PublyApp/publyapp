/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffTenantProfilesQuery: vi.fn(),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				profiles: 'Profiles',
				'select-profiles': 'Select profiles',
				default: 'Default',
				search: 'Search...',
				'search-profiles': 'Search profiles',
				previous: 'Previous',
				next: 'Next',
				'loading-profiles': 'Loading profiles…',
				'no-profiles-available': 'No profiles are available.',
				'unable-to-load-profiles': 'Unable to load profiles.',
				'profiles-selected-count_one': '{{count}} profile selected',
			})[key] ?? key,
	}),
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useStaffTenantProfilesQuery: mocks.useStaffTenantProfilesQuery,
	toStaffTenantProfileRows: (items: unknown[]) =>
		Array.isArray(items) ? items : [],
}));

import { InviteProfileSelect } from './_invite-profile-select';

const pageOf = (rows: unknown[], nextCursor?: string) => ({
	data: { data: rows, nextCursor },
	isPending: false,
	isError: false,
});

const TestForm = () => {
	const methods = useForm({ defaultValues: { profileIds: [] as string[] } });
	return (
		<FormProvider {...methods}>
			<InviteProfileSelect
				tenantId="tenant-1"
				name="profileIds"
				label="Profiles"
				onSessionExpired={vi.fn()}
			/>
			<output data-testid="selected-profile-ids">
				{methods.watch('profileIds').join(',')}
			</output>
		</FormProvider>
	);
};

afterEach(() => {
	cleanup();
});

beforeEach(() => {
	mocks.useStaffTenantProfilesQuery.mockReset();
	mocks.useStaffTenantProfilesQuery.mockReturnValue(
		pageOf([
			{ id: 'profile-1', name: 'Everyone', isDefault: true },
			{ id: 'profile-2', name: 'Reviewers', isDefault: false },
		]),
	);
});

describe('InviteProfileSelect', () => {
	test('queries with the paginated page size and no cursor on first load', () => {
		render(<TestForm />);

		expect(mocks.useStaffTenantProfilesQuery).toHaveBeenCalledWith(
			expect.objectContaining({ size: 20, cursor: undefined }),
		);
	});

	test('renders visible checkboxes and selected chips keyed by id', async () => {
		render(<TestForm />);

		// The trigger's accessible name comes from aria-labelledby -> the field
		// label, not from its inner status text.
		fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));

		expect(screen.getByText('Default')).toBeTruthy();
		expect(
			document.querySelectorAll(
				'[data-slot="dropdown-menu-checkbox-item-box"]',
			),
		).toHaveLength(2);

		fireEvent.click(screen.getByText('Reviewers'));

		await waitFor(() =>
			expect(screen.getByTestId('selected-profile-ids').textContent).toBe(
				'profile-2',
			),
		);
		expect(screen.getAllByText('Reviewers').length).toBeGreaterThan(1);
	});

	test('passes a trimmed search term as q and keeps typing settled state', async () => {
		render(<TestForm />);
		fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));

		const searchBox = screen.getByLabelText('Search profiles');
		fireEvent.change(searchBox, { target: { value: '  rev  ' } });

		await waitFor(() =>
			expect(mocks.useStaffTenantProfilesQuery).toHaveBeenLastCalledWith(
				expect.objectContaining({ q: 'rev' }),
			),
		);
	});

	test('advances to the next page with the server cursor and retreats back', async () => {
		// Stateful mock keyed by request params — mirrors the real server, where
		// every render re-reads the same page for the same cursor.
		mocks.useStaffTenantProfilesQuery.mockImplementation(
			(variables: { cursor?: string }) =>
				variables.cursor === 'cursor-page-2'
					? pageOf([{ id: 'p2', name: 'B', isDefault: false }])
					: pageOf(
							[{ id: 'p1', name: 'A', isDefault: false }],
							'cursor-page-2',
						),
		);

		render(<TestForm />);
		fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));

		const callLog = () =>
			JSON.stringify(mocks.useStaffTenantProfilesQuery.mock.calls.at(-1)?.[0]);

		fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
		await waitFor(() =>
			expect(callLog()).toContain('"cursor":"cursor-page-2"'),
		);
		expect(screen.getByText('B')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /^Previous/ }));
		await waitFor(() => expect(screen.getByText('A')).toBeTruthy());
		expect(screen.queryByText('B')).toBeNull();
	});

	test('keeps chip labels for selections that leave the loaded page', async () => {
		mocks.useStaffTenantProfilesQuery.mockImplementation(
			(variables: { cursor?: string }) =>
				variables.cursor === 'cursor-page-2'
					? pageOf([{ id: 'other', name: 'Other', isDefault: false }])
					: pageOf(
							[{ id: 'keep-me', name: 'Kept Profile', isDefault: false }],
							'cursor-page-2',
						),
		);

		render(<TestForm />);
		fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));
		fireEvent.click(screen.getByText('Kept Profile'));
		await waitFor(() =>
			expect(screen.getByTestId('selected-profile-ids').textContent).toBe(
				'keep-me',
			),
		);

		fireEvent.click(screen.getByRole('button', { name: /^Next/ }));

		const chipText = document.querySelector('.publy-detail-chip')?.textContent;
		expect(chipText).toBe('Kept Profile');
	});
});
