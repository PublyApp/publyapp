/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	pathname: '/tenant/settings',
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
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
	useRouterState: ({ select }: { select?: (state: unknown) => unknown }) =>
		select?.({ location: { pathname: mocks.pathname } }),
}));

const EN_LABELS: Record<string, string> = {
	general: 'General',
	security: 'Security',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './settings';

const TenantSettingsLayout = (Route as unknown as { component: ComponentType })
	.component;

const TAB_DESTINATIONS = [
	['/tenant/settings', 'General'],
	['/tenant/settings/security', 'Security'],
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
