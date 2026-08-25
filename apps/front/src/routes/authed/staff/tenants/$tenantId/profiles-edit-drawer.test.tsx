/**
 * @vitest-environment jsdom
 */
/**
 * #972 — the tenant profiles LIST hosts the quick-edit drawer.
 *
 * This suite is deliberately not written the way `profiles.test.tsx` is. That
 * file mocks `@tanstack/react-router` wholesale and hands the page a plain
 * object as its search state, so it can prove which arguments the page passes
 * to a `navigate` spy — but it cannot observe a URL, a history stack, or a
 * browser Back, which is exactly what this issue is about.
 *
 * Everything below drives the REAL production route object
 * (`profiles.tsx`'s exported `Route`, with its real `validateSearch`, its real
 * component and its real row actions), the REAL `ProfileEditDetailsDrawer`,
 * and a REAL router over a REAL memory history. The route is re-parented onto
 * a small root the same way `routeTree.gen.ts` re-parents it onto the authed
 * layout (`Route.update({ id, path, getParentRoute })`), which is the only
 * reason its `Route.useSearch()`/`useNavigate()` resolve here — no copy of the
 * route's options is made, so a regression in the real route reaches this
 * suite directly.
 *
 * Only the data layer is faked (the query/mutation modules and the toast
 * owner); no network, no Kiota client.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPROVERS_ID = '0198c0de-1111-7000-8000-aaaaaaaaaaaa';
const SUPPORT_ID = '0198c0de-2222-7000-8000-bbbbbbbbbbbb';
const LIST_PATH = `/staff/tenants/${TENANT_ID}/profiles`;

type ProfileRow = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
	isDefault: boolean;
	userAccountCount: number;
	permissionsCount: number;
};

const buildRows = (): ProfileRow[] => [
	{
		id: APPROVERS_ID,
		name: 'Approvers',
		description: 'Can review approvals',
		isDefault: true,
		userAccountCount: 7,
		permissionsCount: 12,
	},
	{
		id: SUPPORT_ID,
		name: 'Support',
		description: 'Respond to member tickets',
		isDefault: false,
		userAccountCount: 5,
		permissionsCount: 4,
	},
];

const mocks = vi.hoisted(() => ({
	rows: [] as unknown[],
	updateProfileMutation: vi.fn(),
	deleteProfileMutation: vi.fn(),
	bulkDeleteProfileMutation: vi.fn(),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	toStaffTenantProfileRows: () => mocks.rows,
	useStaffTenantProfilesQuery: () => ({
		data: { data: mocks.rows, nextCursor: null },
		error: null,
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn().mockResolvedValue(undefined),
	}),
	useUpdateStaffTenantProfileMutation: () => ({
		mutateAsync: mocks.updateProfileMutation,
		isPending: false,
	}),
	useDeleteStaffTenantProfileMutation: () => ({
		mutateAsync: mocks.deleteProfileMutation,
		isPending: false,
	}),
	useBulkDeleteStaffTenantProfilesMutation: () => ({
		mutateAsync: mocks.bulkDeleteProfileMutation,
		isPending: false,
	}),
	toStaffTenantProfileBulkActionSummary: () => ({
		succeededCount: 0,
		failedCount: 0,
		failedItems: [],
	}),
	// Used by the always-mounted CREATE drawer, which this suite never opens.
	useCreateStaffTenantProfileMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useStaffTenantPermissionCatalogQuery: () => ({
		data: undefined,
		error: null,
		isPending: false,
		isError: false,
	}),
	buildStaffTenantPermissionCatalogGroups: () => [],
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
	toStaffTenantDetails: () => ({
		id: TENANT_ID,
		name: 'Acme Corporation',
		code: 'ACME',
		status: 'Active',
		usersCount: 12,
		maxUsers: 50,
		profilesCount: 2,
		logoUrl: null,
		createdAt: new Date('2026-07-01T09:00:00Z'),
		updatedAt: new Date('2026-07-02T10:00:00Z'),
	}),
	useStaffTenantDetailsQuery: () => ({
		data: { tenantId: TENANT_ID },
		error: null,
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn().mockResolvedValue(undefined),
	}),
	staffTenantCrumbQuery: () => ({ queryKey: ['tenant'], queryFn: () => ({}) }),
	selectStaffTenantCrumbName: () => undefined,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
		warning: mocks.toastWarning,
	},
}));

const TRANSLATIONS: Record<string, string> = {
	basics: 'Basics',
	profiles: 'Profiles',
	invitations: 'Invitations',
	users: 'Users',
	'tenant-profiles-tab-description': 'Permission sets.',
	'new-profile': 'New profile',
	'search-profiles': 'Search profiles…',
	system: 'System',
	custom: 'Custom',
	'all-types': 'All types',
	'view-details': 'View details',
	edit: 'Edit',
	delete: 'Delete',
	close: 'Close',
	cancel: 'Cancel',
	'no-description-provided': 'No description provided.',
	'tenant-member-count': '{{count}} members',
	'tenant-permission-count': '{{count}} permissions',
	'actions-for': 'Actions for {{name}}',
	'select-profile-checkbox-label': 'Select {{name}}',
	'view-toggle-aria-label': 'Switch between cards and table view',
	'cards-view': 'Cards view',
	'table-view': 'Table view',
	'edit-details': 'Edit details',
	'edit-details-subtitle': 'Rename or restyle the {{name}} profile.',
	'profile-icon-picker-hint': 'Tap the tile to change icon & color',
	'restore-automatic-profile-style': 'Use automatic style',
	'profile-details-management-note': 'Permissions are managed in their tabs.',
	'profile-name': 'Profile name',
	'tenant-profile-name-placeholder': 'e.g. Editors',
	description: 'Description',
	'profile-description-placeholder': 'Describe this profile',
	'save-changes': 'Save changes',
	'profile-updated-successfully': 'Profile updated successfully.',
	'unsaved-changes-dialog-title': 'Leave without saving?',
	'unsaved-changes-dialog-description': 'You have unsaved changes.',
	'leave-page': 'Leave page',
	'profile-form-drawer-description': 'Create a profile for this tenant.',
	'create-profile': 'Create profile',
	'loading-permissions': 'Loading permissions…',
	'no-permissions-available': 'No permissions available.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
			let text = TRANSLATIONS[bare] ?? bare;
			for (const [optionKey, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
		i18n: { language: 'en' },
	}),
}));

import { Route as ProfilesRoute } from './profiles';

/** Re-parents the REAL list route onto a throwaway root, exactly as
 * `routeTree.gen.ts` re-parents it onto the authed layout. Sibling stubs stand
 * in for the routes the page's own links point at, so a click that DID leave
 * the list would land somewhere observable instead of erroring. */
function widenOptions<T>(value: unknown): T {
	return value as T;
}

const buildRouter = (initialUrl: string) => {
	const rootRoute = createRootRoute({
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});

	ProfilesRoute.update(
		widenOptions<Parameters<typeof ProfilesRoute.update>[0]>({
			id: '/staff/tenants/$tenantId/profiles',
			path: '/staff/tenants/$tenantId/profiles',
			getParentRoute: () => rootRoute,
		}),
	);

	const stubRoute = (path: string, testId: string) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path,
			staticData: { crumbs: 'shell' },
			component: () => <div data-testid={testId} />,
		});

	const routeTree = rootRoute.addChildren([
		ProfilesRoute,
		stubRoute('/staff/tenants', 'stub-tenants'),
		stubRoute('/staff/tenants/$tenantId', 'stub-tenant-details'),
		stubRoute('/staff/tenants/$tenantId/edit', 'stub-tenant-edit'),
		stubRoute('/staff/tenants/$tenantId/users', 'stub-tenant-users'),
		stubRoute(
			'/staff/tenants/$tenantId/invitations',
			'stub-tenant-invitations',
		),
		stubRoute(
			'/staff/tenants/$tenantId/profiles/$profileId',
			'stub-profile-details',
		),
	]);

	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router: AnyRouter = createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({ routeTree, history }),
	);

	return { router, history, queryClient };
};

const renderList = async (initialUrl = LIST_PATH) => {
	const { router, history, queryClient } = buildRouter(initialUrl);

	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);

	await waitFor(() =>
		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy(),
	);

	return { router, history };
};

const searchParamsOf = (href: string): URLSearchParams =>
	new URL(href, 'http://localhost').searchParams;

const pathnameOf = (href: string): string =>
	new URL(href, 'http://localhost').pathname;

const openEditFor = async (profileId: string) => {
	fireEvent.click(
		screen.getByTestId(`staff-tenant-profile-actions-${profileId}`),
	);
	fireEvent.click(
		await screen.findByTestId(`staff-tenant-profile-edit-${profileId}`),
	);
};

describe('#972 tenant profiles list — quick-edit drawer opens over the list', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.rows = buildRows();
		mocks.invalidateAllStaffTenantScopes.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	test('choosing Edit on a row opens the drawer WITHOUT leaving the list', async () => {
		const { history } = await renderList();

		await openEditFor(SUPPORT_ID);

		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		// The drawer edits THIS row...
		expect(
			screen.getByText('Rename or restyle the Support profile.'),
		).toBeTruthy();
		// ...over a list that never unmounted, on the list's own URL.
		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
		expect(pathnameOf(history.location.href)).toBe(LIST_PATH);
		expect(searchParamsOf(history.location.href).get('edit')).toBe(SUPPORT_ID);
		expect(screen.queryByTestId('stub-profile-details')).toBeNull();
	});

	test('the row action is not a link to the legacy edit route', async () => {
		await renderList();

		fireEvent.click(
			screen.getByTestId(`staff-tenant-profile-actions-${SUPPORT_ID}`),
		);
		const editItem = await screen.findByTestId(
			`staff-tenant-profile-edit-${SUPPORT_ID}`,
		);

		expect(editItem.tagName).not.toBe('A');
		expect(editItem.getAttribute('href')).toBeNull();
	});

	test('opening adds only the edit id, and closing restores the list exactly as it was', async () => {
		const { history } = await renderList(
			`${LIST_PATH}?q=sup&view=table&is_default=false`,
		);

		await openEditFor(SUPPORT_ID);
		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();

		// WHILE OPEN the list underneath must still be the list the user was
		// looking at. Asserting this only after the close would be vacuous: the
		// close pops back to the pre-open history entry, so a broken open that
		// dropped every other search key would still "restore" correctly.
		const openParams = searchParamsOf(history.location.href);
		expect(openParams.get('edit')).toBe(SUPPORT_ID);
		expect(openParams.get('q')).toBe('sup');
		expect(openParams.get('view')).toBe('table');
		expect(openParams.get('is_default')).toBe('false');
		expect(
			screen
				.getByTestId('staff-tenant-profiles-grid-view-toggle-table')
				.getAttribute('aria-pressed'),
		).toBe('true');

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);

		const params = searchParamsOf(history.location.href);
		expect(pathnameOf(history.location.href)).toBe(LIST_PATH);
		expect(params.has('edit')).toBe(false);
		// Every other piece of list state is byte-identical to before the open.
		expect(params.get('q')).toBe('sup');
		expect(params.get('view')).toBe('table');
		expect(params.get('is_default')).toBe('false');
		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
		expect(
			screen
				.getByTestId('staff-tenant-profiles-grid-view-toggle-table')
				.getAttribute('aria-pressed'),
		).toBe('true');
	});

	test('closing the drawer preserves row selection made before it opened', async () => {
		await renderList();

		fireEvent.click(
			screen.getByTestId(`staff-tenant-profile-card-select-${SUPPORT_ID}`),
		);
		expect(
			(
				screen.getByTestId(
					`staff-tenant-profile-card-select-${SUPPORT_ID}`,
				) as HTMLInputElement
			).getAttribute('aria-checked'),
		).toBe('true');

		await openEditFor(SUPPORT_ID);
		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);

		expect(
			screen
				.getByTestId(`staff-tenant-profile-card-select-${SUPPORT_ID}`)
				.getAttribute('aria-checked'),
		).toBe('true');
	});

	test('the browser back button closes the drawer without leaving the list', async () => {
		const { history } = await renderList();

		await openEditFor(SUPPORT_ID);
		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();

		history.back();

		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);
		expect(pathnameOf(history.location.href)).toBe(LIST_PATH);
		expect(searchParamsOf(history.location.href).has('edit')).toBe(false);
		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
	});

	test('an app-side close consumes its own history entry, so the next Back leaves the list', async () => {
		const { history } = await renderList();

		await openEditFor(SUPPORT_ID);
		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);

		// The open/close round trip must leave the history stack exactly as it
		// was — otherwise the first Back after it is a dead press that just
		// re-lands on the list.
		expect(history.canGoBack()).toBe(false);
	});

	test('a deep link opens the drawer on first paint and closes back to the same entry', async () => {
		const { history } = await renderList(`${LIST_PATH}?edit=${APPROVERS_ID}`);

		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		expect(
			screen.getByText('Rename or restyle the Approvers profile.'),
		).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);
		expect(pathnameOf(history.location.href)).toBe(LIST_PATH);
		expect(searchParamsOf(history.location.href).has('edit')).toBe(false);
		// A deep-linked drawer has no history entry of ours to consume, so the
		// close must not pop the user out of the app.
		expect(history.canGoBack()).toBe(false);
	});

	test('an ?edit id that names no loaded row leaves the drawer shut rather than inventing a profile', async () => {
		await renderList(`${LIST_PATH}?edit=0198c0de-9999-7000-8000-cccccccccccc`);

		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
		expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull();
	});

	test('saving updates the row in place and stays on the list', async () => {
		mocks.updateProfileMutation.mockImplementation(async () => {
			mocks.rows = buildRows().map((row) =>
				row.id === SUPPORT_ID ? { ...row, name: 'Support renamed' } : row,
			);
			return {};
		});

		const { history } = await renderList();

		await openEditFor(SUPPORT_ID);
		const nameInput = await screen.findByLabelText('Profile name');
		fireEvent.change(nameInput, { target: { value: 'Support renamed' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: TENANT_ID,
					profileId: SUPPORT_ID,
					name: 'Support renamed',
				}),
			),
		);
		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);

		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Profile updated successfully.',
		);
		await waitFor(() =>
			expect(screen.getByText('Support renamed')).toBeTruthy(),
		);
		expect(pathnameOf(history.location.href)).toBe(LIST_PATH);
		expect(screen.queryByTestId('stub-profile-details')).toBeNull();
	});

	// Entered by deep link on purpose: that close path is a REPLACE navigation,
	// which `@tanstack/history` DOES run the blockers over — so this is the one
	// close route on which the page guard could block the page's own transition
	// if the W8-DRAWER bypass were missing.
	test('cancelling a dirty draft prompts, then the confirmed discard closes back to the list', async () => {
		const { history } = await renderList(`${LIST_PATH}?edit=${SUPPORT_ID}`);

		const nameInput = await screen.findByLabelText('Profile name');
		fireEvent.change(nameInput, { target: { value: 'Support edited' } });

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(await screen.findByText('Leave without saving?')).toBeTruthy();
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();

		// The confirmed discard must not be blocked by the page's OWN nav guard
		// still reading the not-yet-flushed dirty flag (W8-DRAWER).
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));

		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);
		expect(searchParamsOf(history.location.href).has('edit')).toBe(false);
		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
	});

	// The drawer's own Cancel guard (above) cannot see a navigation that leaves
	// the list: it changes the URL flag holding the drawer open without ever
	// calling `onOpenChange`, so the draft would vanish silently. That is what
	// the page-level `useBlocker` is for — the same mechanism, and the same
	// "stays on the open drawer" rule, the detail page already uses.
	//
	// A sibling-route click is used rather than `history.back()` because
	// `@tanstack/history` only consults blockers on PUSH/REPLACE; blocking a
	// real browser Back is implemented in `createBrowserHistory`'s popstate
	// path, which `createMemoryHistory` has no equivalent of. The production
	// guard function under test is the same one either way.
	test('a navigation that leaves the list while the draft is dirty is blocked by the page nav guard', async () => {
		const { history } = await renderList();

		await openEditFor(SUPPORT_ID);
		const nameInput = await screen.findByLabelText('Profile name');
		fireEvent.change(nameInput, { target: { value: 'Support edited' } });
		await waitFor(() =>
			expect((nameInput as HTMLInputElement).value).toBe('Support edited'),
		);

		fireEvent.click(
			screen.getByTestId('tenant-sections-nav').querySelector('a') as Element,
		);

		expect(await screen.findByText('Leave without saving?')).toBeTruthy();
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();
		expect(pathnameOf(history.location.href)).toBe(LIST_PATH);
		expect(searchParamsOf(history.location.href).get('edit')).toBe(SUPPORT_ID);

		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));

		await waitFor(() =>
			expect(screen.getByTestId('stub-tenant-details')).toBeTruthy(),
		);
	});

	// A change that keeps the drawer open (a filter, a sort, a page size) must
	// NOT raise a discard prompt — the draft survives it.
	test('a list-state change that keeps the drawer open does not prompt', async () => {
		await renderList();

		await openEditFor(SUPPORT_ID);
		const nameInput = await screen.findByLabelText('Profile name');
		fireEvent.change(nameInput, { target: { value: 'Support edited' } });
		await waitFor(() =>
			expect((nameInput as HTMLInputElement).value).toBe('Support edited'),
		);

		fireEvent.click(
			screen.getByTestId('staff-tenant-profiles-grid-view-toggle-table'),
		);

		await waitFor(() =>
			expect(
				screen
					.getByTestId('staff-tenant-profiles-grid-view-toggle-table')
					.getAttribute('aria-pressed'),
			).toBe('true'),
		);
		expect(screen.queryByText('Leave without saving?')).toBeNull();
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();
	});
});

/**
 * `?new=1` and `?edit=<id>` are BOTH drawer-open flags on this one route, and
 * every open path spreads the current search. Nothing used to clear the other
 * flag, so both drawers could mount at once — two stacked modals, two "Profile
 * name" fields, one shared discard prompt. Found by an adversarial probe on
 * PR #1035; no test had imagined the two flags coexisting.
 *
 * The invariant is now enforced at the parse/serialize boundary (so a URL
 * carrying both resolves deterministically) AND at both open paths (so a
 * correct URL is produced in the first place).
 */
describe('#972 the create and edit drawers are mutually exclusive', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.rows = buildRows();
		mocks.invalidateAllStaffTenantScopes.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	const openCreateDrawer = () => {
		// `getByText` rather than `getByRole`: once a drawer is open, Base UI
		// marks the rest of the page inert/aria-hidden, which hides the button
		// from role queries while it is still very much clickable.
		fireEvent.click(screen.getByText('New profile'));
	};

	test('a URL carrying BOTH drawer flags mounts exactly one drawer and drops the losing flag', async () => {
		const { history } = await renderList(
			`${LIST_PATH}?new=1&edit=${SUPPORT_ID}`,
		);

		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		expect(screen.queryByTestId('profile-form-drawer')).toBeNull();
		// `edit` names a specific existing row, so it wins; the bare `new` flag
		// must not survive in the address bar either.
		const params = searchParamsOf(history.location.href);
		expect(params.get('edit')).toBe(SUPPORT_ID);
		expect(params.has('new')).toBe(false);
	});

	test('opening Edit while the create drawer is open replaces it instead of stacking a second drawer', async () => {
		const { history } = await renderList(`${LIST_PATH}?new=1`);
		expect(await screen.findByTestId('profile-form-drawer')).toBeTruthy();

		await openEditFor(SUPPORT_ID);

		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		await waitFor(() =>
			expect(screen.queryByTestId('profile-form-drawer')).toBeNull(),
		);
		const params = searchParamsOf(history.location.href);
		expect(params.get('edit')).toBe(SUPPORT_ID);
		expect(params.has('new')).toBe(false);
	});

	test('opening New profile while the edit drawer is open replaces it instead of stacking a second drawer', async () => {
		const { history } = await renderList();

		await openEditFor(SUPPORT_ID);
		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();

		openCreateDrawer();

		expect(await screen.findByTestId('profile-form-drawer')).toBeTruthy();
		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);
		const params = searchParamsOf(history.location.href);
		expect(params.get('new')).toBe('1');
		expect(params.has('edit')).toBe(false);
	});

	// The probe's exact repro.
	test('probe repro: a dirty create draft prompts ONCE before Edit replaces it, and leaves only the edit drawer', async () => {
		await renderList(`${LIST_PATH}?new=1`);

		const createDrawer = await screen.findByTestId('profile-form-drawer');
		const createName = within(createDrawer).getByLabelText('Profile name');
		fireEvent.change(createName, { target: { value: 'Draft profile' } });
		await waitFor(() =>
			expect((createName as HTMLInputElement).value).toBe('Draft profile'),
		);

		await openEditFor(SUPPORT_ID);

		// Exactly one discard prompt — the create draft's — not one per drawer.
		expect(await screen.findByText('Leave without saving?')).toBeTruthy();
		expect(screen.getAllByText('Leave without saving?')).toHaveLength(1);

		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));

		expect(
			await screen.findByTestId('profile-edit-details-drawer'),
		).toBeTruthy();
		await waitFor(() =>
			expect(screen.queryByTestId('profile-form-drawer')).toBeNull(),
		);
		// One name field on screen, and it belongs to the profile being edited.
		expect(screen.getAllByLabelText('Profile name')).toHaveLength(1);
		expect(
			(screen.getByLabelText('Profile name') as HTMLInputElement).value,
		).toBe('Support');

		// The discarded create form is still mounted (closed) and still reports
		// itself dirty until a reopen resets it — that stale flag must not raise
		// a second, phantom prompt on the NEXT navigation.
		fireEvent.click(
			screen.getByTestId('tenant-sections-nav').querySelector('a') as Element,
		);
		await waitFor(() =>
			expect(screen.getByTestId('stub-tenant-details')).toBeTruthy(),
		);
		expect(screen.queryByText('Leave without saving?')).toBeNull();
	});

	// The mirror direction: the prompt must be about the EDIT draft, and
	// confirming it must not also silently discard anything else.
	test('a dirty edit draft prompts once before New profile replaces it', async () => {
		await renderList();

		await openEditFor(SUPPORT_ID);
		const editDrawer = await screen.findByTestId('profile-edit-details-drawer');
		const editName = within(editDrawer).getByLabelText('Profile name');
		fireEvent.change(editName, { target: { value: 'Support edited' } });
		await waitFor(() =>
			expect((editName as HTMLInputElement).value).toBe('Support edited'),
		);

		openCreateDrawer();

		expect(await screen.findByText('Leave without saving?')).toBeTruthy();
		expect(screen.getAllByText('Leave without saving?')).toHaveLength(1);
		// Still the edit drawer's prompt — the create drawer has not mounted yet.
		expect(screen.queryByTestId('profile-form-drawer')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));

		expect(await screen.findByTestId('profile-form-drawer')).toBeTruthy();
		await waitFor(() =>
			expect(screen.queryByTestId('profile-edit-details-drawer')).toBeNull(),
		);
		// The create form opens blank, not carrying the discarded edit draft.
		expect(
			(screen.getByLabelText('Profile name') as HTMLInputElement).value,
		).toBe('');
	});
});
