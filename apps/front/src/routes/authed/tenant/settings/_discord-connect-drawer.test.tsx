/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

let connectImpl: (input: {
	tenantId: string;
	webhookUrl: string;
}) => Promise<void> = async () => undefined;

vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useConnectDiscordWebhookMutation: () => ({
		mutateAsync: connectImpl,
		isPending: false,
	}),
}));

const EN_LABELS = {
	'discord-connect-title': 'Connect a Discord webhook',
	'discord-reconnect-title': 'Reconnect a Discord webhook',
	'discord-webhook-label': 'Webhook URL',
	'discord-webhook-help': 'Paste the webhook URL',
	'discord-submit': 'Connect webhook',
	'common:an-error-occurred': 'Something went wrong',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key as keyof typeof EN_LABELS] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { DiscordConnectDrawer } from './_discord-connect-drawer';

const WEBHOOK = `https://discord.com/api/webhooks/1234567890123456789/${'a'.repeat(68)}`;

afterEach(() => {
	cleanup();
	connectImpl = async () => undefined;
});

describe('discord connect drawer', () => {
	test('ItShouldSendThePastedUrlAndCloseOnSuccess', async () => {
		connectImpl = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();

		render(
			<DiscordConnectDrawer open onOpenChange={onOpenChange} tenantId="t1" />,
		);
		await userEvent
			.setup()
			.type(screen.getByTestId('discord-webhook-url'), WEBHOOK);
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /connect webhook/i }));

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(connectImpl).toHaveBeenCalledWith({
			tenantId: 't1',
			webhookUrl: WEBHOOK,
			socialAccountId: undefined,
		});
	});

	test('ItShouldSendTheAccountIdWhenReconnecting', async () => {
		connectImpl = vi.fn().mockResolvedValue(undefined);

		render(
			<DiscordConnectDrawer
				open
				onOpenChange={vi.fn()}
				tenantId="t1"
				account={{
					id: 'a1',
					provider: 'discord_webhook',
					displayHandle: 'Release notes',
					statusWire: 'needs_reconnect',
					tone: 'warning',
					statusLabelKey: 'settings:status-needs-reconnect',
					lastSuccessAt: null,
					projectIds: [],
				}}
			/>,
		);
		await userEvent
			.setup()
			.type(screen.getByTestId('discord-webhook-url'), WEBHOOK);
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /connect webhook/i }));

		await waitFor(() =>
			expect(connectImpl).toHaveBeenCalledWith({
				tenantId: 't1',
				webhookUrl: WEBHOOK,
				socialAccountId: 'a1',
			}),
		);
	});

	test('ItShouldKeepTheUrlMaskedAsAPasswordField', () => {
		render(<DiscordConnectDrawer open onOpenChange={vi.fn()} tenantId="t1" />);

		expect(
			(screen.getByTestId('discord-webhook-url') as HTMLInputElement).type,
		).toBe('password');
	});

	test('ItShouldShowTheServersReasonOnTheUrlFieldAndNotCloseWhenRefused', async () => {
		connectImpl = vi.fn().mockRejectedValue({
			status: 422,
			translationKey: 'discord-webhook-refused',
			errors: { webhookUrl: ['Discord does not recognise this webhook.'] },
		});
		const onOpenChange = vi.fn();

		render(
			<DiscordConnectDrawer open onOpenChange={onOpenChange} tenantId="t1" />,
		);
		await userEvent
			.setup()
			.type(screen.getByTestId('discord-webhook-url'), WEBHOOK);
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /connect webhook/i }));

		await waitFor(() =>
			expect(screen.getByText(/does not recognise this webhook/i)).toBeTruthy(),
		);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	test('ItShouldTitleAReconnectAndUseTheReconnectTestId', () => {
		render(
			<DiscordConnectDrawer
				open
				onOpenChange={vi.fn()}
				tenantId="t1"
				account={{
					id: 'a1',
					provider: 'discord_webhook',
					displayHandle: 'Release notes',
					statusWire: 'needs_reconnect',
					tone: 'warning',
					statusLabelKey: 'settings:status-needs-reconnect',
					lastSuccessAt: null,
					projectIds: [],
				}}
			/>,
		);

		expect(screen.getByTestId('discord-reconnect-drawer')).toBeTruthy();
		expect(screen.getByText('Reconnect a Discord webhook')).toBeTruthy();
	});
});
