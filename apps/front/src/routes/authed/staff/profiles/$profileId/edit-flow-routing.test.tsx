/** @vitest-environment jsdom */
/**
 * #819 Tier-2 guard: the staff-profile detail page's edit flow driven through
 * a REAL TanStack router — the same tier the tenant-profile sections got in
 * #977 (`section-routing.test.tsx`), because `$profileId.test.tsx` drives the
 * production predicate directly against a mocked router and can therefore
 * never prove that the REAL router actually consults it, that `?edit=1`
 * really round-trips through `validateSearch`, or that the REAL drawer +
 * REAL ConfirmDialog close the loop.
 *
 * What is real here:
 *  - the production route object from `$profileId.tsx` (its real
 *    `validateSearch`, real component, real `useBlocker` registration),
 *    `.update()`-ed onto a throwaway tree exactly the way `routeTree.gen`
 *    wires it;
 *  - a real `createRouter` + `createMemoryHistory`, real `<Link>`
 *    navigation;
 *  - the real edit drawer (Base UI dialog, react-hook-form) and the real
 *    ConfirmDialog — nothing about them is stubbed here.
 *
 * What is faked: only the network-facing query hooks (`~/lib/query/*`) and
 * i18n. Every pure helper in those modules stays real via `importOriginal`.
 *
 * The synthetic parent is the pattern this repo already uses for real-route
 * tests (`deep-link-canonicalization.test.tsx`,
 * `$profileId/section-routing.test.tsx` guard B): mounting the whole app
 * route tree would drag in session/auth bootstrapping that has nothing to do
 * with the thing being proved.
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
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';
const DETAILS_PATH = `/staff/profiles/${PROFILE_ID}`;
const PROFILES_LIST_PATH = '/staff/profiles';

const mocks = vi.hoisted(() => ({
	detailsPayload: {
		profile: {
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Platform admin',
			description: 'Full access',
			userAccountCount: 2,
			icon: 'shield-check',
			tone: '5',
		},
	},
	permissionKeys: ['staff.users.read'],
}));

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: vi.fn().mockResolvedValue(undefined),
});

vi.mock('~/lib/query/staff-profiles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-profiles')>();

	return {
		...actual,
		useStaffProfileDetailsQuery: () => settledQuery(mocks.detailsPayload),
		useStaffProfilePermissionKeysQuery: () =>
			settledQuery({ permissionKeys: mocks.permissionKeys }),
		useStaffPermissionCatalogQuery: () => settledQuery(undefined),
	};
});

vi.mock('~/lib/query/staff-profile-users', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-profile-users')>();

	return {
		...actual,
		useStaffProfileUsersQuery: () => settledQuery({ users: [] }),
	};
});

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':') ? (key.split(':').at(-1) ?? key) : key;
			let text = bare;
			for (const [optionKey, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}

			return text;
		},
		i18n: { language: 'en' },
	}),
}));

import { Route as StaffProfileDetailsRoute } from '../$profileId';

/**
 * `createFileRoute(...)(options)` does not attach the id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Doing the same here mounts the REAL route object (same identity, so its
 * own `Route.useParams()`/`useSearch()`/`useNavigate()` resolve against the
 * router built below), just under a throwaway parent.
 */
const mountRealRoute = <TRoute,>(
	route: TRoute,
	options: Record<string, unknown>,
): TRoute => {
	// The real `update` returns the route for chaining; this harness discards
	// the result, so the narrowed call signature honestly returns void.
	(route as { update: (options: Record<string, unknown>) => void }).update(
		options,
	);

	return route;
};

/** Memory histories created here never register a window-level listener,
 * but the router holds them until GC — track and destroy explicitly so a
 * stale history cannot answer a later test's navigation. */
const openHistories: { destroy: () => void }[] = [];

const destroyOpenHistories = (): void => {
	while (openHistories.length > 0) {
		openHistories.pop()?.destroy();
	}
};

const buildRouter = (initialUrl: string) => {
	const rootRoute = createRootRoute({
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_authed-layout',
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const detailsRoute = mountRealRoute(StaffProfileDetailsRoute, {
		id: '/staff/profiles/$profileId',
		path: '/staff/profiles/$profileId',
		getParentRoute: () => layoutRoute,
	});
	const profilesListRoute = createRoute({
		getParentRoute: () => layoutRoute,
		path: '/staff/profiles',
		staticData: { crumbs: 'shell' },
		component: () => <div data-testid="profiles-list-page" />,
	});

	const routeTree = rootRoute.addChildren([
		layoutRoute.addChildren([detailsRoute, profilesListRoute]),
	]);

	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createRouter({ routeTree, history });

	return { router, history, queryClient };
};

const renderAt = async (initialUrl: string) => {
	const harness = buildRouter(initialUrl);
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId('staff-profile-details-page')).toBeTruthy(),
	);

	return harness;
};

/** Types into the REAL edit drawer's real name field, which is what makes
 * the drawer report a dirty draft to the page's nav guard. */
const dirtyTheEditDraft = async () => {
	const nameInput = await waitFor(() => {
		const input =
			document.querySelector<HTMLInputElement>('input[name="name"]');
		if (!input) {
			throw new Error('edit drawer name field not rendered');
		}

		return input;
	});
	fireEvent.change(nameInput, { target: { value: 'Renamed platform admin' } });
	await waitFor(() => expect(nameInput.value).toBe('Renamed platform admin'));
};

describe('#819 the staff-profile edit flow (real router)', () => {
	beforeEach(() => {
		mocks.detailsPayload = {
			profile: {
				id: PROFILE_ID,
				name: 'Platform admin',
				description: 'Full access',
				userAccountCount: 2,
				icon: 'shield-check',
				tone: '5',
			},
		};
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	test('?edit=1 deep link opens the drawer; leaving while dirty is blocked until confirmed', async () => {
		const { history } = await renderAt(`${DETAILS_PATH}?edit=1`);
		expect(
			screen.getByTestId('staff-profile-edit-details-drawer'),
		).toBeTruthy();

		await dirtyTheEditDraft();

		fireEvent.click(
			document.querySelector<HTMLAnchorElement>(
				'a.publy-back-link[href="/staff/profiles"]',
			)!,
		);

		// Blocked: the confirm dialog asks, and neither the URL nor the page
		// moves while the draft is unconfirmed.
		await waitFor(() =>
			expect(screen.getByText('unsaved-changes-dialog-title')).toBeTruthy(),
		);
		expect(history.location.pathname).toBe(DETAILS_PATH);
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.get(
				'edit',
			),
		).toBe('1');

		fireEvent.click(screen.getByRole('button', { name: 'leave-page' }));
		await waitFor(() =>
			expect(history.location.pathname).toBe(PROFILES_LIST_PATH),
		);
		expect(screen.getByTestId('profiles-list-page')).toBeTruthy();
	});

	test('a non-1 edit value is dropped from the URL by the route boundary', async () => {
		const { history } = await renderAt(`${DETAILS_PATH}?edit=2`);

		expect(
			screen.queryByTestId('staff-profile-edit-details-drawer'),
		).toBeNull();
		expect(history.location.href).not.toContain('edit=');
	});

	test('the Edit button round-trips the flag: opening writes ?edit=1, a clean close removes it', async () => {
		const { history } = await renderAt(DETAILS_PATH);
		expect(
			screen.queryByTestId('staff-profile-edit-details-drawer'),
		).toBeNull();

		fireEvent.click(screen.getByTestId('staff-profile-edit-button'));

		await waitFor(() =>
			expect(
				screen.getByTestId('staff-profile-edit-details-drawer'),
			).toBeTruthy(),
		);
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.get(
				'edit',
			),
		).toBe('1');

		// A clean close (no edits) needs no confirmation and clears the flag.
		fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
		await waitFor(() =>
			expect(
				screen.queryByTestId('staff-profile-edit-details-drawer'),
			).toBeNull(),
		);
		expect(history.location.href).not.toContain('edit=');
		expect(history.location.pathname).toBe(DETAILS_PATH);
	});
});
