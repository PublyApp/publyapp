/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { useStaffUserOverviewContext } from './$userId/_overview-context';

const mocks = vi.hoisted(() => ({
	toAssignedStaffProfiles: vi.fn(),
	toStaffUserDetails: vi.fn(),
	useStaffUserProfilesQuery: vi.fn(),
	useStaffUserDetailsQuery: vi.fn(),
	useDeleteStaffUserMutation: vi.fn(),
	deleteMutateAsync: vi.fn().mockResolvedValue(undefined),
	useReactivateStaffUserMutation: vi.fn(),
	useSuspendStaffUserMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	displayLocalMutationFailure: vi.fn(),
	toastSuccess: vi.fn(),
	navigate: vi.fn().mockResolvedValue(undefined),
	pathname: '/staff/staff-users/11111111-1111-1111-1111-111111111111/',
	queryClient: {
		invalidateQueries: vi.fn().mockResolvedValue(undefined),
		removeQueries: vi.fn(),
	},
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useParams: () => ({
			userId: '11111111-1111-1111-1111-111111111111',
		}),
	}),
	useNavigate: () => mocks.navigate,
	useRouterState: ({
		select,
	}: {
		select: (state: { location: { pathname: string } }) => void;
	}) => select({ location: { pathname: mocks.pathname } }),
	// Stands in for the real body-level danger zone (owned by `$userId/index.tsx`)
	// so this file can still exercise the mutation/dialog wiring that lives in
	// the parent route, now that suspend/delete are only reachable via context.
	Outlet: () => {
		const {
			onOpenSuspendDialog,
			onOpenDeleteDialog,
			canSuspend,
			canReactivate,
			isDeletePending,
			suspendLabelKey,
			profilesIsPending,
			onRetryProfiles,
		} = useStaffUserOverviewContext();
		const suspendLabel =
			suspendLabelKey === 'reactivate' ? 'Reactivate' : 'Suspend';

		return (
			<div data-testid="staff-user-details-outlet">
				<span data-testid="staff-user-details-outlet-profiles-pending">
					{String(profilesIsPending)}
				</span>
				<button type="button" onClick={onRetryProfiles}>
					Retry profiles
				</button>
				<button
					type="button"
					onClick={onOpenSuspendDialog}
					disabled={!canSuspend && !canReactivate}
				>
					{suspendLabel}
				</button>
				<button
					type="button"
					onClick={onOpenDeleteDialog}
					disabled={isDeletePending}
				>
					Delete
				</button>
			</div>
		);
	},
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const I18N_LABELS: TestLabelMap = {
	'back-to-staff-users': 'Back to staff users',
	'staff-user-not-found-title': 'staff member not found',
	'staff-user-not-found-description':
		'The staff member you are looking for does not exist or may have been removed.',
	'unable-to-load-staff-user': 'Unable to load this staff user',
	'problem-loading-staff-user-details':
		'There was a problem loading the staff user details.',
	'staff-user-payload-empty': 'The staff user payload was empty.',
	'try-again': 'Try Again',
	'loading-staff-user': 'Loading staff user…',
	'no-email-address': 'No email address',
	admin: 'Admin',
	user: 'User',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-unknown': 'Unknown',
	unknown: 'Unknown',
	edit: 'Edit',
	overview: 'Overview',
	permissions: 'Permissions',
	activity: 'Activity',
	settings: 'Settings',
	suspend: 'Suspend',
	reactivate: 'Reactivate',
	'suspend-staff-user': 'Suspend staff member',
	'reactivate-staff-user': 'Reactivate staff member',
	'suspend-staff-user-confirm':
		'Are you sure you want to suspend this staff member? They will not be able to access the staff dashboard while suspended.',
	'reactivate-staff-user-confirm':
		'Are you sure you want to reactivate this staff member? They will regain access to the staff dashboard.',
	'confirm-delete-staff-user-title': 'Delete staff member',
	'confirm-delete-staff-user-message':
		'Are you sure you want to delete this staff member? This action cannot be easily undone.',
	delete: 'Delete',
	'delete-confirm-instructions':
		'To delete this account, type “delete” in the field below.',
	'confirm-delete-field-label': 'Confirm delete',
	'type-delete-to-confirm-placeholder': 'Type delete to confirm',
	'staff-user-suspended-success': 'This staff user has been suspended.',
	'staff-user-reactivated-success': 'This staff user has been reactivated.',
	'unable-to-suspend-staff-user': 'Unable to suspend this staff user.',
	'unable-to-reactivate-staff-user': 'Unable to reactivate this staff user.',
	'unable-to-delete-staff-user': 'Unable to delete this staff user.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const resolvedKey = key.replace(/^common:/, '');
			return I18N_LABELS[resolvedKey] ?? resolvedKey;
		},
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => mocks.queryClient,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-users', () => ({
	STAFF_USERS_QUERY_KEY: ['staff-users'],
	STAFF_USER_DETAILS_QUERY_KEY: ['staff-users', 'detail'],
	invalidateStaffUsers: (queryClient: {
		invalidateQueries: (options: { queryKey: unknown[] }) => Promise<void>;
	}) => queryClient.invalidateQueries({ queryKey: ['staff', 'staff-users'] }),
	removeStaffUserDetails: (queryClient: {
		removeQueries: (options: { queryKey: unknown[] }) => void;
	}) =>
		queryClient.removeQueries({
			queryKey: ['staff', 'staff-users', 'detail'],
		}),
	toAssignedStaffProfiles: mocks.toAssignedStaffProfiles,
	toStaffUserDetails: mocks.toStaffUserDetails,
	useStaffUserProfilesQuery: mocks.useStaffUserProfilesQuery,
	useStaffUserDetailsQuery: mocks.useStaffUserDetailsQuery,
	useDeleteStaffUserMutation: mocks.useDeleteStaffUserMutation,
	useReactivateStaffUserMutation: mocks.useReactivateStaffUserMutation,
	useSuspendStaffUserMutation: mocks.useSuspendStaffUserMutation,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const BASE_PATH = `/staff/staff-users/${USER_ID}`;

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const buildMutationResult = (overrides: Record<string, unknown> = {}) => ({
	mutate: vi.fn(),
	mutateAsync: vi.fn().mockResolvedValue(undefined),
	isPending: false,
	isError: false,
	isSuccess: false,
	...overrides,
});

const renderPage = () => {
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff user details route shell', () => {
	test('declares the staff-users i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['staff-users']);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.pathname = `${BASE_PATH}/`;
		mocks.navigate.mockResolvedValue(undefined);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					id: USER_ID,
				},
			}),
		);
		mocks.useStaffUserProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					assignedProfiles: [],
					maxProfilesPerUser: 5,
				},
			}),
		);
		mocks.deleteMutateAsync.mockResolvedValue(undefined);
		mocks.useDeleteStaffUserMutation.mockReturnValue(
			buildMutationResult({ mutateAsync: mocks.deleteMutateAsync }),
		);
		mocks.useReactivateStaffUserMutation.mockReturnValue(buildMutationResult());
		mocks.useSuspendStaffUserMutation.mockReturnValue(buildMutationResult());
		mocks.toStaffUserDetails.mockReturnValue({
			id: USER_ID,
			email: 'owner@publyapp.local',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: null,
			accountLevel: 'Admin',
			status: 'Active',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Owner User',
		});
		mocks.toAssignedStaffProfiles.mockReturnValue([]);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders "No email address" fallback when email is empty', () => {
		mocks.toStaffUserDetails.mockReturnValue({
			id: USER_ID,
			email: '',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: null,
			accountLevel: 'Admin',
			status: 'Active',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Owner User',
		});

		renderPage();

		const matches = screen.getAllByText('No email address');
		expect(matches).toHaveLength(1);
	});

	test('renders the detail page shell with identity, tab strip, and an outlet for the active tab', () => {
		renderPage();

		expect(screen.getByTestId('staff-user-details-page')).toBeTruthy();

		const page = within(screen.getByTestId('staff-user-details-page'));
		expect(page.getAllByText('Admin')).toHaveLength(1);
		expect(page.getAllByText('Active')).toHaveLength(1);

		expect(
			screen.getByRole('link', { name: 'Back to staff users' }),
		).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Owner User' })).toBeTruthy();
		expect(screen.getByText('owner@publyapp.local')).toBeTruthy();
		expect(screen.getByText('Overview')).toBeTruthy();
		expect(screen.getByText('Permissions')).toBeTruthy();
		expect(screen.getByText('Activity')).toBeTruthy();
		expect(screen.getByText('Settings')).toBeTruthy();

		expect(screen.getByTestId('staff-user-details-outlet')).toBeTruthy();
	});

	test('renders the page (past the details-pending gate) while the profiles query is still pending, and surfaces that pending state through context (r5-F6)', () => {
		mocks.useStaffUserProfilesQuery.mockReturnValue(
			buildQueryResult({ data: undefined, isPending: true }),
		);

		renderPage();

		expect(screen.getByTestId('staff-user-details-page')).toBeTruthy();
		expect(
			screen.getByTestId('staff-user-details-outlet-profiles-pending')
				.textContent,
		).toBe('true');
	});

	test('surfaces profiles resolved (non-pending) through context once the query succeeds', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-user-details-outlet-profiles-pending')
				.textContent,
		).toBe('false');
	});

	test('the context retry callback refetches the profiles query, not the details query', () => {
		const profilesRefetch = vi.fn().mockResolvedValue(undefined);
		mocks.useStaffUserProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: { assignedProfiles: [], maxProfilesPerUser: 5 },
				refetch: profilesRefetch,
			}),
		);

		renderPage();
		fireEvent.click(screen.getByText('Retry profiles'));

		expect(profilesRefetch).toHaveBeenCalledTimes(1);
	});

	test('each tab trigger renders as a real anchor with the deep-linkable href', () => {
		renderPage();

		expect(
			(
				screen.getByRole('tab', { name: 'Overview' }) as HTMLAnchorElement
			).getAttribute('href'),
		).toBe(BASE_PATH);
		expect(
			(
				screen.getByRole('tab', { name: 'Permissions' }) as HTMLAnchorElement
			).getAttribute('href'),
		).toBe(`${BASE_PATH}/permissions`);
		expect(
			(
				screen.getByRole('tab', { name: 'Activity' }) as HTMLAnchorElement
			).getAttribute('href'),
		).toBe(`${BASE_PATH}/activity`);
		expect(
			(
				screen.getByRole('tab', { name: 'Settings' }) as HTMLAnchorElement
			).getAttribute('href'),
		).toBe(`${BASE_PATH}/settings`);
	});

	test('the Overview trigger is active on the bare detail route', () => {
		mocks.pathname = `${BASE_PATH}/`;

		renderPage();

		expect(
			screen.getByRole('tab', { name: 'Overview' }).hasAttribute('data-active'),
		).toBe(true);
		expect(
			screen
				.getByRole('tab', { name: 'Permissions' })
				.hasAttribute('data-active'),
		).toBe(false);
	});

	test('the Permissions trigger is active when mounted at the permissions route, not Overview', () => {
		mocks.pathname = `${BASE_PATH}/permissions`;

		renderPage();

		expect(
			screen
				.getByRole('tab', { name: 'Permissions' })
				.hasAttribute('data-active'),
		).toBe(true);
		expect(
			screen.getByRole('tab', { name: 'Overview' }).hasAttribute('data-active'),
		).toBe(false);
	});

	test('the Settings trigger is active when mounted at the settings route', () => {
		mocks.pathname = `${BASE_PATH}/settings`;

		renderPage();

		expect(
			screen.getByRole('tab', { name: 'Settings' }).hasAttribute('data-active'),
		).toBe(true);
		expect(
			screen.getByRole('tab', { name: 'Overview' }).hasAttribute('data-active'),
		).toBe(false);
	});

	test('renders the not-found view for 400 malformed-id failures', () => {
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid userId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-user-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders a local not found view for 404 failures', () => {
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Missing user',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-user-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('uses logout redirect for 401 failures', () => {
		const error = {
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		};

		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error,
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('uses logout redirect for 401 failures from the assigned profiles query', () => {
		const error = {
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		};

		mocks.useStaffUserProfilesQuery.mockReturnValue(
			buildQueryResult({
				error,
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	// (b) Suspend opens the suspend dialog; confirming calls suspendUser.mutateAsync
	// Suspend is triggered from the Danger-zone card in `$userId/index.tsx`
	// (rendered here by the Outlet stub via the shared overview context) — the
	// header no longer carries a Suspend control.
	test('ItShouldCallSuspendMutationWhenSuspendConfirmed', async () => {
		const suspendMutateAsync = vi.fn().mockResolvedValue(undefined);
		mocks.useSuspendStaffUserMutation.mockReturnValue(
			buildMutationResult({ mutateAsync: suspendMutateAsync }),
		);

		renderPage();

		const suspendButtons = screen.getAllByText('Suspend');
		fireEvent.click(suspendButtons[0]);

		const alertDialog = screen.getByRole('alertdialog', {
			name: 'Suspend staff member',
		});
		const confirmButton = within(alertDialog).getByRole('button', {
			name: 'Suspend',
		});
		fireEvent.click(confirmButton);

		expect(suspendMutateAsync).toHaveBeenCalledWith({
			userId: USER_ID,
		});
		await vi.waitFor(() =>
			expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled(),
		);
		expect(
			screen.queryByText('This staff user has been suspended.'),
		).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	// (c) when status is suspended the control reads Reactivate and confirming calls reactivateUser.mutateAsync
	test('ItShouldCallReactivateMutationWhenReactivateConfirmed', () => {
		mocks.toStaffUserDetails.mockReturnValue({
			id: USER_ID,
			email: 'owner@publyapp.local',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: null,
			accountLevel: 'Admin',
			status: 'Suspended',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Owner User',
		});

		const reactivateMutateAsync = vi.fn().mockResolvedValue(undefined);
		mocks.useReactivateStaffUserMutation.mockReturnValue(
			buildMutationResult({ mutateAsync: reactivateMutateAsync }),
		);

		renderPage();

		const reactivateButtons = screen.getAllByText('Reactivate');
		fireEvent.click(reactivateButtons[0]);

		const alertDialog = screen.getByRole('alertdialog', {
			name: 'Reactivate staff member',
		});
		const confirmButton = within(alertDialog).getByRole('button', {
			name: 'Reactivate',
		});
		fireEvent.click(confirmButton);

		expect(reactivateMutateAsync).toHaveBeenCalledWith({
			userId: USER_ID,
		});
	});

	// (e) confirming delete calls deleteUser.mutateAsync and then navigates
	// Delete is triggered from the Danger-zone card in `$userId/index.tsx`
	// (rendered here by the Outlet stub via the shared overview context) — the
	// header ⋯ menu no longer carries a Delete item.
	test('ItShouldCallDeleteMutationAndNavigateWhenDeleteConfirmed', async () => {
		const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
		mocks.useDeleteStaffUserMutation.mockReturnValue(
			buildMutationResult({ mutateAsync: deleteMutateAsync }),
		);

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		const confirmField = screen.getByLabelText('Confirm delete');
		fireEvent.change(confirmField, { target: { value: 'delete' } });

		const alertDialog = screen.getByRole('alertdialog', {
			name: 'Delete staff member',
		});
		const confirmButton = within(alertDialog).getByRole('button', {
			name: 'Delete',
		});
		fireEvent.click(confirmButton);

		await vi.waitFor(() => {
			expect(deleteMutateAsync).toHaveBeenCalledWith({
				userId: USER_ID,
			});
		});
		await vi.waitFor(() => {
			expect(mocks.queryClient.removeQueries).toHaveBeenCalled();
			expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled();
		});

		expect(mocks.queryClient.removeQueries).toHaveBeenCalledWith({
			queryKey: ['staff', 'staff-users', 'detail'],
		});
		expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', 'staff-users'],
		});
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/staff/staff-users',
		});
		expect(mocks.navigate.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.queryClient.removeQueries.mock.invocationCallOrder[0],
		);
		expect(mocks.navigate.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.queryClient.invalidateQueries.mock.invocationCallOrder[0],
		);

		expect(screen.queryByTestId('staff-user-details-not-found')).toBeNull();
	});

	test('ItShouldNotNavigateOrTouchCacheWhenDeleteFails', async () => {
		mocks.deleteMutateAsync.mockRejectedValue({ status: 500 });

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		const confirmField = screen.getByLabelText('Confirm delete');
		fireEvent.change(confirmField, { target: { value: 'delete' } });

		const alertDialog = screen.getByRole('alertdialog', {
			name: 'Delete staff member',
		});
		const confirmButton = within(alertDialog).getByRole('button', {
			name: 'Delete',
		});
		fireEvent.click(confirmButton);

		await vi.waitFor(() => {
			expect(mocks.deleteMutateAsync).toHaveBeenCalledWith({
				userId: USER_ID,
			});
		});
		expect(screen.queryByRole('alert')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();

		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.queryClient.removeQueries).not.toHaveBeenCalled();
		expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled();
	});
});
