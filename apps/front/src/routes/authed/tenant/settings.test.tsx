/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	pathname: '/tenant/settings',
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: ({
		to,
		children,
		...props
	}: {
		to: string;
		children: ReactNode;
		[key: string]: unknown;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	Outlet: () => <div data-testid="outlet-stub">outlet</div>,
	useRouterState: ({ select }: { select?: (state: unknown) => void }) =>
		select?.({ location: { pathname: mocks.pathname } }),
}));

const EN_LABELS: TestLabelMap = {
	general: 'General',
	security: 'Security',
	members: 'Members',
	workspaces: 'Workspaces',
	'roles-and-permissions': 'Roles & permissions',
	integrations: 'Integrations',
	billing: 'Billing',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './settings';

const TenantSettingsLayout = Route.options.component as ComponentType;

const TAB_DESTINATIONS = [
	['/tenant/settings', 'General'],
	['/tenant/settings/members', 'Members'],
	['/tenant/settings/workspaces', 'Workspaces'],
	['/tenant/settings/roles', 'Roles & permissions'],
	['/tenant/settings/security', 'Security'],
	['/tenant/settings/integrations', 'Integrations'],
	['/tenant/settings/billing', 'Billing'],
] as const;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.pathname = '/tenant/settings';
});

describe('TenantSettingsLayout', () => {
	test('renders a tab for every settings section with the right destination', () => {
		render(<TenantSettingsLayout />);

		for (const [to, label] of TAB_DESTINATIONS) {
			const tab = screen.getByRole('tab', { name: label });
			expect(tab.getAttribute('href')).toBe(to);
		}
	});

	test('renders the child route through the outlet', () => {
		render(<TenantSettingsLayout />);
		expect(screen.getByTestId('outlet-stub')).toBeTruthy();
	});

	test('derives the active tab from the current pathname', () => {
		mocks.pathname = '/tenant/settings/security';
		render(<TenantSettingsLayout />);

		const activeTab = screen
			.getAllByRole('tab')
			.find((tab) => tab.getAttribute('aria-selected') === 'true');
		expect(activeTab?.textContent).toBe('Security');
	});
});
