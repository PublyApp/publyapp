/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	// Forward every prop: Base UI merges data-slot/className onto the
	// rendered Link, and assertions below rely on seeing them.
	Link: ({
		to,
		children,
		...rest
	}: {
		to: string;
		children?: React.ReactNode;
	}) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

let socialAccountsWire: Array<Record<string, unknown>> = [];
let permissionKeys: string[] = ['*'];

vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useSocialAccountsQuery: () => ({
		data: { data: socialAccountsWire, nextCursor: null },
		isPending: false,
		isError: false,
		refetch: () => Promise.resolve(),
	}),
}));

vi.mock('~/lib/permissions/use-has-tenant-permission', () => ({
	useCanManageSocialAccounts: () =>
		permissionKeys.includes('*') ||
		permissionKeys.includes('tenant.socialaccounts.manage'),
}));

const EN_LABELS = {
	'banner-needs-reconnect-single': '{{handle}} needs reconnecting',
	'banner-needs-reconnect-plural':
		'{{count}} connected accounts need reconnecting',
	reconnect: 'Reconnect',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) => {
			const template = EN_LABELS[key as keyof typeof EN_LABELS] ?? key;
			if (!opts) {
				return template;
			}
			return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
				String(opts[name] ?? `{{${name}}}`),
			);
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { NeedsReconnectBanner } from './_needs-reconnect-banner';

const wireItem = (id: string, displayHandle: string, status: string) => ({
	id,
	provider: 'bluesky',
	displayHandle,
	status,
	lastSuccessAt: null,
	projectIds: [],
});

afterEach(() => {
	cleanup();
	socialAccountsWire = [];
	permissionKeys = ['*'];
});

describe('needs-reconnect banner', () => {
	test('ItShouldNameTheAccountAndLinkToIntegrationsWhenOneNeedsReconnect', () => {
		socialAccountsWire = [
			wireItem('a1', '@old.bsky.social', 'needs_reconnect'),
		];

		render(<NeedsReconnectBanner tenantId="t1" />);

		const banner = screen.getByTestId('needs-reconnect-banner');
		expect(banner.textContent).toContain('@old.bsky.social');
		const link = screen.getByRole('link');
		expect(link.getAttribute('href')).toContain(
			'/tenant/settings/integrations',
		);
	});

	test('ItShouldRenderNullWhenEveryAccountIsActive', () => {
		socialAccountsWire = [wireItem('a1', '@ok.bsky.social', 'active')];

		const { container } = render(<NeedsReconnectBanner tenantId="t1" />);

		expect(
			container.querySelector('[data-testid="needs-reconnect-banner"]'),
		).toBeNull();
	});

	test('ItShouldHideTheReconnectButtonFromHoldersWithoutManage', () => {
		socialAccountsWire = [
			wireItem('a1', '@old.bsky.social', 'needs_reconnect'),
		];
		permissionKeys = ['tenant.socialaccounts.view'];

		render(<NeedsReconnectBanner tenantId="t1" />);

		expect(screen.getByTestId('needs-reconnect-banner')).toBeTruthy();
		// The manage-gated action is a Button (data-slot="button") rendering a
		// Link; assert on the button surface, not the accessible role, so a
		// link-styled action for view-only holders still counts as absent.
		expect(
			screen
				.queryByTestId('needs-reconnect-banner')
				?.querySelector('[data-slot="button"]'),
		).toBeNull();
		expect(screen.getByRole('link').textContent).toMatch(/reconnect/i);
	});
});
