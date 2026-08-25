/** @vitest-environment jsdom */
/**
 * #1400 round-1 review (MAJOR finding): the fourth bulk-bar page,
 * `tenant-users/$userId-organizations`, had NO label-in-name proof — its
 * legacy test only exercised `buildOrganizationColumnsForTests` and never
 * mounted the selection bar, so reintroducing
 * `aria-label="More actions"` under a visible "Bulk actions" on this page
 * kept the whole suite green.
 *
 * This suite mounts the REAL route object through a real `createRouter`
 * (same `.update()` wiring as `routeTree.gen.ts`, same harness precedent as
 * `staff-users-bulk-routing.test.tsx`) and the REAL production i18n init
 * helper (`createI18nFromResources` from `~/lib/i18n.shared`) fed the REAL
 * shipped `en/common.json` and `fr/common.json` bundles — the same instance
 * shape `__root.tsx` serves in production. `react-i18next` is NEVER mocked
 * here: the FR bundle is genuinely loaded (fallbackLng disabled by the shared
 * helper), so a missing key surfaces as the raw key string and fails loudly
 * instead of silently matching an EN-only synthetic `t`.
 *
 * It pins the WCAG 2.5.3 "label in name" contract on this page: the bulk
 * trigger's accessible name must EQUAL its visible "Bulk actions" label,
 * which holds structurally only while both come from the same `bulk-actions`
 * i18n key through `ui/bulk-actions-trigger`.
 *
 * Mocked at the seam only: the network-facing surface
 * (`~/lib/query/staff-global-tenant-users` hooks + row mappers), the link
 * drawer host, mutation toasts, and logout routing.
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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import resourceEN from '~/i18n/locales/en/common.json';
import resourceFR from '~/i18n/locales/fr/common.json';
import {
	createI18nFromResources,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

const mocks = vi.hoisted(() => ({
	toGlobalTenantUserCompanyRows: vi.fn(),
	useGlobalTenantUserCompaniesQuery: vi.fn(),
	useBulkUnlinkGlobalTenantUserCompaniesMutation: vi.fn(),
	bulkUnlink: vi.fn().mockResolvedValue({ succeededCount: 1, failedCount: 0 }),
}));

vi.mock('~/lib/query/staff-global-tenant-users', () => ({
	toGlobalTenantUserCompanyRows: mocks.toGlobalTenantUserCompanyRows,
	useGlobalTenantUserDetailsQuery: () => ({
		data: undefined,
		error: null,
		isPending: false,
		isError: false,
		refetch: () => Promise.resolve(),
	}),
	useGlobalTenantUserCompaniesQuery: mocks.useGlobalTenantUserCompaniesQuery,
	useGlobalTenantUsersPickerQuery: () => ({
		data: undefined,
		isPending: false,
	}),
	useLinkGlobalTenantUserCompaniesMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useBulkUnlinkGlobalTenantUserCompaniesMutation:
		mocks.useBulkUnlinkGlobalTenantUserCompaniesMutation,
	invalidateGlobalTenantUsers: () => Promise.resolve(),
	toGlobalTenantUserBulkUnlinkSummary: (result: {
		succeededCount?: number;
		failedCount?: number;
	}) => ({
		succeededCount: result?.succeededCount ?? 0,
		failedCount: result?.failedCount ?? 0,
		failedItems: [],
	}),
	globalTenantUserCrumbQuery: {},
	selectGlobalTenantUserCrumbName: () => null,
	toGlobalTenantUserDetails: () => ({
		id: '11111111-1111-1111-1111-111111111111',
		email: 'alex@example.com',
		firstName: 'Alex',
		lastName: 'User',
		status: 'Active',
		avatarUrl: null,
		companyCount: 1,
		createdAt: null,
		updatedAt: null,
		displayName: 'Alex User',
	}),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastLocalMutationResult: {
		success: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

// The link-companies drawer pulls its own form machinery irrelevant to the
// bulk bar; stubbed so the harness stays free of that surface.
vi.mock('./$userId-organizations-drawer', () => ({
	LinkCompaniesDrawerHost: () => null,
}));

import { Route } from './$userId-organizations';

const RESOURCES: I18nResources = {
	en: { common: resourceEN },
	fr: { common: resourceFR },
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID = '22222222-2222-2222-2222-222222222222';

// Same shape `toGlobalTenantUserCompanyRows` produces (itself mocked here).
const companyRows = [
	{
		id: TENANT_ID,
		name: 'Acme Corp',
		logoUrl: null,
		level: null,
		status: 'Active',
		createdAt: new Date('2026-07-01T09:00:00Z'),
		updatedAt: new Date('2026-07-02T10:00:00Z'),
	},
];

/**
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Same harness precedent as `staff-users-bulk-routing.test.tsx`.
 */
const widen = <T,>(value: unknown): T => value as T;

/** Row-checkbox accessible name derived FROM THE REAL BUNDLE of that
 * language (`select-row-named`: "Select {{name}}" / "Sélectionner {{name}}")
 * — never hardcoded English. */
const rowCheckboxName = (language: SupportedLanguage): string =>
	(language === 'en' ? resourceEN : resourceFR)['select-row-named'].replace(
		'{{name}}',
		TENANT_ID,
	);

describe('#1400 tenant-user organizations tab: bulk trigger label-in-name (real router, real bundles)', () => {
	let i18n: I18nInstance;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.toGlobalTenantUserCompanyRows.mockReturnValue(companyRows);
		mocks.useGlobalTenantUserCompaniesQuery.mockReturnValue({
			data: { data: companyRows, nextCursor: null },
			error: null,
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: () => Promise.resolve(),
		});
		mocks.useBulkUnlinkGlobalTenantUserCompaniesMutation.mockReturnValue({
			mutateAsync: mocks.bulkUnlink,
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	const renderAtOrganizationsTab = async (
		language: SupportedLanguage,
	): Promise<void> => {
		i18n = createI18nFromResources(language, ['common'], RESOURCES);

		const rootRoute = createRootRoute({
			staticData: { crumbs: 'shell' },
			component: () => createElement(Outlet),
		});
		const layoutRoute = createRoute({
			getParentRoute: () => rootRoute,
			id: '/_authed-layout',
			staticData: { crumbs: 'shell' },
			component: () => createElement(Outlet),
		} as never);
		// The PARAMETERIZED path, exactly as `routeTree.gen.ts` declares it —
		// a literal path here would drop `$userId` from `useParams`.
		const ROUTE_PATH = '/staff/tenant-users/details/$userId/organizations';
		const tabRoute = widen<{
			update: (options: Record<string, unknown>) => void;
		}>(Route).update({
			id: `/_authed-layout${ROUTE_PATH}`,
			path: ROUTE_PATH,
			getParentRoute: () => layoutRoute,
		});
		const addChildrenOf = widen<{
			addChildren: (children: unknown[]) => void;
		}>;
		const routeTree = addChildrenOf(rootRoute).addChildren([
			addChildrenOf(layoutRoute).addChildren([tabRoute]),
		]);

		const LIST_URL = `/staff/tenant-users/details/${USER_ID}/organizations`;
		const history = createMemoryHistory({
			initialEntries: [LIST_URL],
		});
		const queryClient = new QueryClient();
		const router = createRouter({
			routeTree,
			history,
			context: { queryClient },
		} as never);

		render(
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(I18nextProvider, { i18n }),
				createElement(RouterProvider, { router }),
			),
		);

		await screen.findByTestId('tenant-user-companies-table');
	};

	for (const language of ['en', 'fr'] as const) {
		test(`(${language}) the bulk trigger accessible name equals its visible label`, async () => {
			await renderAtOrganizationsTab(language);

			fireEvent.click(
				await screen.findByRole('checkbox', {
					name: rowCheckboxName(language),
				}),
			);

			const expectedLabel =
				language === 'en' ? 'Bulk actions' : 'Actions groupées';
			const trigger = await screen.findByRole('button', {
				name: expectedLabel,
			});

			expect(trigger.getAttribute('aria-label')).toBe(expectedLabel);
			expect(trigger.textContent).toContain(expectedLabel);
			expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
			expect(
				screen.queryByRole('button', { name: "Plus d'actions" }),
			).toBeNull();
		});
	}

	test('(en) the menu item comes from the real en bundle', async () => {
		await renderAtOrganizationsTab('en');

		fireEvent.click(
			await screen.findByRole('checkbox', { name: rowCheckboxName('en') }),
		);
		fireEvent.click(
			await screen.findByRole('button', { name: 'Bulk actions' }),
		);

		expect(
			await screen.findByRole('menuitem', {
				name: 'Remove from selected organizations',
			}),
		).toBeTruthy();
	});

	test('(fr) the menu item comes from the real fr bundle', async () => {
		await renderAtOrganizationsTab('fr');

		fireEvent.click(
			await screen.findByRole('checkbox', { name: rowCheckboxName('fr') }),
		);
		fireEvent.click(
			await screen.findByRole('button', { name: 'Actions groupées' }),
		);

		expect(
			await screen.findByRole('menuitem', {
				name: 'Retirer des organisations sélectionnées',
			}),
		).toBeTruthy();
	});
});
