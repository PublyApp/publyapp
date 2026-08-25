/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	pathname: '/tenant/account',
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
	profile: 'Profile',
	security: 'Security',
	notifications: 'Notifications',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './account';

const TenantAccountLayout = Route.options.component as ComponentType;

const TAB_DESTINATIONS = [
	['/tenant/account', 'Profile'],
	['/tenant/account/security', 'Security'],
	['/tenant/account/notifications', 'Notifications'],
] as const;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.pathname = '/tenant/account';
});

describe('TenantAccountLayout', () => {
	test('renders a tab for every account section with the right destination', () => {
		render(<TenantAccountLayout />);

		for (const [to, label] of TAB_DESTINATIONS) {
			const tab = screen.getByRole('tab', { name: label });
			expect(tab.getAttribute('href')).toBe(to);
		}
	});

	test('renders the child route through the outlet', () => {
		render(<TenantAccountLayout />);
		expect(screen.getByTestId('outlet-stub')).toBeTruthy();
	});

	test('derives the active tab from the current pathname', () => {
		mocks.pathname = '/tenant/account/security';
		render(<TenantAccountLayout />);

		const activeTab = screen
			.getAllByRole('tab')
			.find((tab) => tab.getAttribute('aria-selected') === 'true');
		expect(activeTab?.textContent).toBe('Security');
	});
});
