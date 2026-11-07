/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	pathname: '/staff/dashboard',
}));

vi.mock('@tanstack/react-router', () => ({
	useRouterState: ({
		select,
	}: {
		select: (state: { location: { pathname: string } }) => string;
	}) => select({ location: { pathname: mocks.pathname } }),
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
		children: React.ReactNode;
		[key: string]: unknown;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	Outlet: () => <div data-testid="dashboard-outlet" />,
}));

const EN_LABELS: TestLabelMap = {
	dashboard: 'Tableau de bord',
	overview: 'Aperçu',
	activity: 'Activité',
	reports: 'Rapports',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './dashboard';

const StaffDashboardPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	mocks.pathname = '/staff/dashboard';
});

describe('staff dashboard shell', () => {
	test('keeps the « Tableau de bord » title on every tab', () => {
		for (const pathname of [
			'/staff/dashboard',
			'/staff/dashboard/activity',
			'/staff/dashboard/reports',
		]) {
			mocks.pathname = pathname;
			render(<StaffDashboardPage />);

			expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
				'Tableau de bord',
			);
			expect(screen.getByTestId('dashboard-outlet')).toBeTruthy();

			cleanup();
		}
	});

	test('renders the three tab links to the overview, activity and reports routes', () => {
		render(<StaffDashboardPage />);

		// Base UI's tab trigger is the interactive element; the router `render`
		// prop is what makes it an anchor in the browser.
		expect(
			screen.getByRole('tab', { name: 'Aperçu' }).getAttribute('href'),
		).toBe('/staff/dashboard');
		expect(
			screen.getByRole('tab', { name: 'Activité' }).getAttribute('href'),
		).toBe('/staff/dashboard/activity');
		expect(
			screen.getByRole('tab', { name: 'Rapports' }).getAttribute('href'),
		).toBe('/staff/dashboard/reports');
	});
});
