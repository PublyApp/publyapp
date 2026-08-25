/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

const EN_LABELS: TestLabelMap = {
	'invalid-link-title': 'This link is invalid or expired',
	'request-a-new-link': 'Request a new link',
	'back-to-login': 'Back to login',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { language: 'en' },
	}),
}));

import { InvalidLinkView } from './invalid-link-view';

describe('InvalidLinkView', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders the title, the passed-in reason, and both recovery actions', () => {
		render(
			createElement(InvalidLinkView, {
				description: 'The verification link you issued is invalid or expired.',
				requestNewLinkHref: '/verify-email',
			}),
		);

		expect(
			screen.getByRole('heading', { name: 'This link is invalid or expired' }),
		).toBeTruthy();
		expect(
			screen.getByText(
				'The verification link you issued is invalid or expired.',
			),
		).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Request a new link' }),
		).toHaveProperty('href', expect.stringContaining('/verify-email'));
		expect(screen.getByRole('link', { name: 'Back to login' })).toHaveProperty(
			'href',
			expect.stringContaining('/login'),
		);
	});

	test('defaults the testid and accepts an override', () => {
		const { unmount } = render(
			createElement(InvalidLinkView, {
				description: 'reason',
				requestNewLinkHref: '/reset-password',
			}),
		);
		expect(screen.getByTestId('auth-invalid-link-view')).toBeTruthy();
		unmount();

		render(
			createElement(InvalidLinkView, {
				description: 'reason',
				requestNewLinkHref: '/reset-password',
				testId: 'custom-invalid-link-view',
			}),
		);
		expect(screen.getByTestId('custom-invalid-link-view')).toBeTruthy();
	});
});
