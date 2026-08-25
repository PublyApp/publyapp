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
	queue: 'Queue',
	'queue-coming-later-title': 'The posting queue is coming later',
	'queue-coming-later-description':
		'Posts waiting to be published will appear here once the posts API ships.',
	'common:queue': 'Queue',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './queue';

const TenantPostsQueuePage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantPostsQueuePage', () => {
	test('renders the section heading and the honest coming-later state', () => {
		render(<TenantPostsQueuePage />);

		expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy();
		expect(screen.getByText('The posting queue is coming later')).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-queue-empty')).toBeTruthy();
	});

	test('shows the read-only badge and no fake queued-post rows or controls', () => {
		render(<TenantPostsQueuePage />);

		expect(screen.getByTestId('account-read-only-badge')).toBeTruthy();
		expect(screen.queryAllByRole('button').length).toBe(0);
	});
});
