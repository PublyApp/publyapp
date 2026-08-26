/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

const EN_LABELS: TestLabelMap = {
	calendar: 'Calendar',
	'calendar-coming-later-title': 'The calendar is coming later',
	'calendar-coming-later-description':
		'Scheduled posts across your connected profiles will appear here once the posts API ships.',
	'common:calendar': 'Calendar',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './calendar';

const TenantPostsCalendarPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantPostsCalendarPage', () => {
	test('renders the section heading and the honest coming-later state', () => {
		render(<TenantPostsCalendarPage />);

		expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy();
		expect(screen.getByText('The calendar is coming later')).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-calendar-empty')).toBeTruthy();
	});

	test('shows the read-only badge and no fake scheduling controls', () => {
		render(<TenantPostsCalendarPage />);

		expect(screen.getByTestId('account-read-only-badge')).toBeTruthy();
		expect(screen.queryAllByRole('button').length).toBe(0);
	});
});
