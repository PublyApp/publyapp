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
import { createElement } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffTenantRolesQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				roles: 'Roles',
				'select-roles': 'Select roles',
				default: 'Default',
				search: 'Search...',
				'search-roles': 'Search roles',
				previous: 'Previous',
				next: 'Next',
				'loading-roles': 'Loading roles…',
				'no-roles-available': 'No roles are available.',
				'unable-to-load-roles': 'Unable to load roles.',
				'roles-selected-count_one': '{{count}} role selected',
				'common:default-role-name': 'Profil par défaut',
			})[key] ?? key,
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement(
			'div',
			{ 'data-testid': 'invite-role-logout-redirect' },
			'logout',
		),
}));

vi.mock('~/lib/query/staff-tenant-roles', () => ({
	useStaffTenantRolesQuery: mocks.useStaffTenantRolesQuery,
	toStaffTenantRoleRows: (items: unknown[]) =>
		Array.isArray(items) ? items : [],
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { InviteRoleSelect } from './_invite-role-select';

const pageOf = (rows: unknown[], nextCursor?: string) => ({
	data: { data: rows, nextCursor },
	isPending: false,
	isError: false,
});

const errorPage = (error: {
	status: number;
	title: string;
	detail: string;
}) => ({
	data: undefined,
	error: { ...error, responseStatusCode: error.status },
	isPending: false,
	isError: true,
});

const TestForm = () => {
	const methods = useForm({ defaultValues: { roleIds: [] as string[] } });
	return (
		<FormProvider {...methods}>
			<InviteRoleSelect tenantId="tenant-1" name="roleIds" label="Roles" />
			<output data-testid="selected-role-ids">
				{methods.watch('roleIds').join(',')}
			</output>
		</FormProvider>
	);
};

afterEach(() => {
	cleanup();
});

beforeEach(() => {
	mocks.useStaffTenantRolesQuery.mockReset();
	mocks.useStaffTenantRolesQuery.mockReturnValue(
		pageOf([
			{ id: 'role-1', name: 'Default role', isDefault: true },
			{ id: 'role-2', name: 'Reviewers', isDefault: false },
		]),
	);
});

describe('InviteRoleSelect', () => {
	test('queries with the paginated page size and no cursor on first load', () => {
		render(<TestForm />);

		expect(mocks.useStaffTenantRolesQuery).toHaveBeenCalledWith(
			expect.objectContaining({ size: 20, cursor: undefined }),
		);
	});

	test('renders visible checkboxes and selected chips keyed by id', async () => {
		render(<TestForm />);

		// The trigger's accessible name comes from aria-labelledby -> the field
		// label, not from its inner status text.
		fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

		expect(screen.getByText('Default')).toBeTruthy();
		expect(
			document.querySelectorAll(
				'[data-slot="dropdown-menu-checkbox-item-box"]',
			),
		).toHaveLength(2);

		fireEvent.click(screen.getByText('Reviewers'));

		await waitFor(() =>
			expect(screen.getByTestId('selected-role-ids').textContent).toBe(
				'role-2',
			),
		);
		expect(screen.getAllByText('Reviewers').length).toBeGreaterThan(1);
	});

	test('renders the translated default role name in the dropdown and chips', async () => {
		render(<TestForm />);

		fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

		expect(screen.getByText('Profil par défaut')).toBeTruthy();
		expect(screen.queryByText('Default role')).toBeNull();

		fireEvent.click(screen.getByText('Profil par défaut'));

		await waitFor(() =>
			expect(screen.getByTestId('selected-role-ids').textContent).toBe(
				'role-1',
			),
		);
		// The dropdown row and the selected chip both use the display name.
		expect(screen.getAllByText('Profil par défaut')).toHaveLength(2);
		expect(screen.queryByText('Default role')).toBeNull();
	});

	test('passes a trimmed search term as q and keeps typing settled state', async () => {
		render(<TestForm />);
		fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

		const searchBox = screen.getByLabelText('Search roles');
		fireEvent.change(searchBox, { target: { value: '  rev  ' } });

		await waitFor(() =>
			expect(mocks.useStaffTenantRolesQuery).toHaveBeenLastCalledWith(
				expect.objectContaining({ q: 'rev' }),
			),
		);
	});

	test('advances to the next page with the server cursor and retreats back', async () => {
		// Stateful mock keyed by request params — mirrors the real server, where
		// every render re-reads the same page for the same cursor.
		mocks.useStaffTenantRolesQuery.mockImplementation(
			(variables: { cursor?: string }) =>
				variables.cursor === 'cursor-page-2'
					? pageOf([{ id: 'p2', name: 'B', isDefault: false }])
					: pageOf(
							[{ id: 'p1', name: 'A', isDefault: false }],
							'cursor-page-2',
						),
		);

		render(<TestForm />);
		fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

		const callLog = () =>
			JSON.stringify(mocks.useStaffTenantRolesQuery.mock.calls.at(-1)?.[0]);

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
		mocks.useStaffTenantRolesQuery.mockImplementation(
			(variables: { cursor?: string }) =>
				variables.cursor === 'cursor-page-2'
					? pageOf([{ id: 'other', name: 'Other', isDefault: false }])
					: pageOf(
							[{ id: 'keep-me', name: 'Kept Role', isDefault: false }],
							'cursor-page-2',
						),
		);

		render(<TestForm />);
		fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
		fireEvent.click(screen.getByText('Kept Role'));
		await waitFor(() =>
			expect(screen.getByTestId('selected-role-ids').textContent).toBe(
				'keep-me',
			),
		);

		fireEvent.click(screen.getByRole('button', { name: /^Next/ }));

		const chipText = document.querySelector('.publy-detail-chip')?.textContent;
		expect(chipText).toBe('Kept Role');
	});

	// Fatal-error render gate (tenants.tsx pattern): a session-killing failure
	// short-circuits to the logout redirect. Two tests pin the gate so neither
	// side of it can silently regress:
	//   - positive: 401 + shouldLogoutForFailure=true -> LogoutRedirect rendered
	//   - negative: non-fatal error (403) -> dropdown still rendered, no redirect
	// Removing the gate breaks the positive test; an "always redirect" mutation
	// breaks the negative one. Both must stay green for the gate to be correct.
	test('renders LogoutRedirect when the role query fails fatally (401)', () => {
		mocks.useStaffTenantRolesQuery.mockReturnValue(
			errorPage({
				status: 401,
				title: 'Unauthorized',
				detail: 'Session expired',
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(<TestForm />);

		expect(screen.getByTestId('invite-role-logout-redirect')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Roles' })).toBeNull();
	});

	test('still renders the dropdown when the query errors non-fatally (403)', () => {
		mocks.useStaffTenantRolesQuery.mockReturnValue(
			errorPage({ status: 403, title: 'Forbidden', detail: 'Forbidden' }),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(false);

		render(<TestForm />);

		expect(screen.queryByTestId('invite-role-logout-redirect')).toBeNull();
		expect(screen.getByRole('button', { name: 'Roles' })).toBeTruthy();
	});
});
