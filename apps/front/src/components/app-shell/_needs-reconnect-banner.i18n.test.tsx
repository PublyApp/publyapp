/**
 * @vitest-environment jsdom
 */
// The banner is mounted by the app shell on every tenant route, not only on Settings:
// the `settings` namespace it reads must therefore be requested by the tenant layout
// route. Real bundles, loaded exactly like the root loader does for a drafts page.
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, test, vi } from 'vitest';
import resourceEN from '~/i18n/locales/en';
import { createI18nFromResources } from '~/lib/i18n/react-i18n';

import { collectI18nNamespaces } from '@org/shared-ts/lib/i18n/namespaces';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: ({ to, children }: { to: string; children?: React.ReactNode }) => (
		<a href={to}>{children}</a>
	),
	Navigate: () => null,
	Outlet: () => null,
	useRouterState: () => ({}),
}));

vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useSocialAccountsQuery: () => ({
		data: {
			data: [
				{
					id: 'a1',
					provider: 'bluesky',
					displayHandle: '@old.bsky.social',
					status: 'needs_reconnect',
					lastSuccessAt: null,
					projectIds: [],
				},
			],
			nextCursor: null,
		},
		isPending: false,
		isError: false,
		refetch: () => Promise.resolve(),
	}),
}));

vi.mock('~/lib/query/provider-capabilities', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useDisabledProviders: () => new Set<string>(),
}));

vi.mock('~/lib/permissions/use-has-tenant-permission', () => ({
	useCanManageSocialAccounts: () => true,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route as TenantRoute } from '~/routes/authed/tenant';
// eslint-disable-next-line import/first
import { Route as DraftsRoute } from '~/routes/authed/tenant/posts/drafts';

// eslint-disable-next-line import/first
import { NeedsReconnectBanner } from './_needs-reconnect-banner';

afterEach(cleanup);

describe('needs-reconnect banner copy on a non-settings tenant route', () => {
	test('ItShouldRenderRealCopyNotRawKeysWhenOnlyTheDraftsRouteNamespacesAreLoaded', () => {
		const namespaces = collectI18nNamespaces([
			{ staticData: TenantRoute.options.staticData },
			{ staticData: DraftsRoute.options.staticData },
		]);
		const resources = Object.fromEntries(
			namespaces.map((namespace) => [namespace, resourceEN[namespace]]),
		);
		const i18n = createI18nFromResources('en', namespaces, { en: resources });

		render(
			createElement(
				I18nextProvider,
				{ i18n },
				createElement(NeedsReconnectBanner, { tenantId: 't1' }),
			),
		);

		const banner = screen.getByTestId('needs-reconnect-banner');
		expect(banner.textContent).toContain('@old.bsky.social needs reconnecting');
		expect(banner.textContent).not.toContain('banner-needs-reconnect');
		expect(screen.getByRole('link').textContent).toBe('Reconnect');
	});
});
