/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { ReconnectBanner } from './reconnect-banner';

const ACCOUNT = {
	id: '11111111-1111-1111-1111-111111111111',
	displayHandle: '@test.bsky.social',
	lastError: 'Bluesky refused: invalid app password',
};

/** Dictionary contract: the banner's social-accounts namespace copy. */
const EN_LABELS: TestLabelMap = {
	'reconnect-banner-title': '{{handle}} needs reconnection',
	'reconnect-banner-description':
		'{{handle}} stopped working and its scheduled posts were paused.',
	'reconnect-banner-more': '+{{count}} more account(s)',
	'reconnect-banner-button': 'Reconnect',
	'reconnect-banner-contact-admin':
		'Ask someone with manage access to reconnect this account.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = EN_LABELS[key] ?? key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ReconnectBanner', () => {
	test('renders nothing when no account needs reconnect', () => {
		const { container } = render(
			<ReconnectBanner
				accounts={[]}
				hasManagePermission={true}
				onReconnect={() => {}}
			/>,
		);
		expect(
			container.querySelector('[data-testid="reconnect-banner"]'),
		).toBeNull();
	});

	test('names the first account needing reconnect', () => {
		render(
			<ReconnectBanner
				accounts={[ACCOUNT]}
				hasManagePermission={true}
				onReconnect={() => {}}
			/>,
		);
		expect(screen.getByTestId('reconnect-banner').textContent).toContain(
			'@test.bsky.social',
		);
	});

	test('shows the reconnect button for manage holders', () => {
		render(
			<ReconnectBanner
				accounts={[ACCOUNT]}
				hasManagePermission={true}
				onReconnect={() => {}}
			/>,
		);
		expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
	});

	test('hides the button and shows the contact-admin message otherwise', () => {
		render(
			<ReconnectBanner
				accounts={[ACCOUNT]}
				hasManagePermission={false}
				onReconnect={() => {}}
			/>,
		);
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByTestId('reconnect-banner').textContent).toContain(
			'manage',
		);
	});

	test('calls onReconnect with the account id on click', async () => {
		const user = userEvent.setup();
		const onReconnect = vi.fn();
		render(
			<ReconnectBanner
				accounts={[ACCOUNT]}
				hasManagePermission={true}
				onReconnect={onReconnect}
			/>,
		);
		await user.click(screen.getByRole('button', { name: 'Reconnect' }));
		expect(onReconnect).toHaveBeenCalledWith(ACCOUNT.id);
	});
});
