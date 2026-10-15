/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

let startImpl: (input: {
	tenantId: string;
	instance: string;
}) => Promise<string> = async () => '';

vi.mock('~/lib/query/mastodon-connect', () => ({
	useStartMastodonConnectMutation: () => ({
		mutateAsync: startImpl,
		isPending: false,
	}),
}));

const EN_LABELS = {
	'mastodon-connect-title': 'Connect Mastodon',
	'mastodon-reconnect-title': 'Reconnect Mastodon',
	'mastodon-instance-label': 'Mastodon server',
	'mastodon-instance-help': 'Enter your server address',
	'mastodon-submit': 'Continue to Mastodon',
	'common:an-error-occurred': 'Something went wrong',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key as keyof typeof EN_LABELS] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { MastodonConnectDrawer } from './_mastodon-connect-drawer';

const assign = vi.fn();

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	assign.mockReset();
	startImpl = async () => '';
});

const stubLocation = () =>
	vi.stubGlobal('location', { assign, href: '', origin: 'http://localhost' });

describe('mastodon connect drawer', () => {
	test('ItShouldSendTheBrowserToTheInstanceAuthorizeUrl', async () => {
		stubLocation();
		startImpl = vi
			.fn()
			.mockResolvedValue('https://social.example/oauth/authorize?state=s1');

		render(<MastodonConnectDrawer open onOpenChange={vi.fn()} tenantId="t1" />);
		await userEvent
			.setup()
			.type(screen.getByTestId('mastodon-instance'), 'social.example');
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /continue to mastodon/i }));

		await waitFor(() =>
			expect(assign).toHaveBeenCalledWith(
				'https://social.example/oauth/authorize?state=s1',
			),
		);
		expect(startImpl).toHaveBeenCalledWith({
			tenantId: 't1',
			instance: 'social.example',
		});
	});

	test('ItShouldShowTheServersReasonOnTheInstanceFieldWhenTheHostIsRefused', async () => {
		stubLocation();
		startImpl = vi.fn().mockRejectedValue({
			status: 422,
			translationKey: 'mastodon-instance-invalid',
			errors: {
				instance: ['Enter the public https address of a Mastodon server.'],
			},
		});

		render(<MastodonConnectDrawer open onOpenChange={vi.fn()} tenantId="t1" />);
		await userEvent
			.setup()
			.type(screen.getByTestId('mastodon-instance'), 'localhost');
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /continue to mastodon/i }));

		await waitFor(() =>
			expect(screen.getByText(/public https address/i)).toBeTruthy(),
		);
		expect(assign).not.toHaveBeenCalled();
	});

	test('ItShouldPrefillAndLockTheInstanceOnReconnect', () => {
		render(
			<MastodonConnectDrawer
				open
				onOpenChange={vi.fn()}
				tenantId="t1"
				account={{
					id: 'a1',
					provider: 'mastodon',
					displayHandle: 'me@social.example',
					statusWire: 'needs_reconnect',
					tone: 'warning',
					statusLabelKey: 'settings:status-needs-reconnect',
					lastSuccessAt: null,
					projectIds: [],
				}}
			/>,
		);

		const input = screen.getByTestId('mastodon-instance');
		expect((input as HTMLInputElement).value).toBe('social.example');
		expect((input as HTMLInputElement).disabled).toBe(true);
	});
});
