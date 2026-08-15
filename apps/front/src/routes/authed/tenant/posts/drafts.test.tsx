/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
}));

const EN_LABELS: Record<string, string> = {
	drafts: 'Drafts',
	'drafts-coming-later-title': 'Drafts are coming later',
	'drafts-coming-later-description':
		'Your draft posts will appear here once the posts API ships.',
	'common:drafts': 'Drafts',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './drafts';

const TenantPostsDraftsPage = (Route as unknown as { component: ComponentType })
	.component;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantPostsDraftsPage', () => {
	test('renders the section heading and the honest coming-later state', () => {
		render(<TenantPostsDraftsPage />);

		expect(screen.getByRole('heading', { name: 'Drafts' })).toBeTruthy();
		expect(screen.getByText('Drafts are coming later')).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-drafts-empty')).toBeTruthy();
	});

	test('shows the read-only badge and no fake draft rows or controls', () => {
		render(<TenantPostsDraftsPage />);

		expect(screen.getByTestId('account-read-only-badge')).toBeTruthy();
		expect(screen.queryAllByRole('button').length).toBe(0);
	});
});
