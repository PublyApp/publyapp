/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

let connectImpl: (input: {
	identifier: string;
}) => Promise<void> = async () => {};
let reconnectImpl: (input: {
	appPassword: string;
}) => Promise<void> = async () => {};

// Override ONLY the mutation hooks the drawer consumes; keep every other
// export real.
vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useConnectSocialAccountMutation: () => ({
		mutateAsync: connectImpl,
		isPending: false,
	}),
	useReconnectSocialAccountMutation: () => ({
		mutateAsync: reconnectImpl,
		isPending: false,
	}),
}));

vi.mock('~/lib/query/tenant-projects', () => ({
	useTenantProjectsQuery: () => ({ data: undefined }),
	toTenantProjectItems: () => [{ id: 'p1', name: 'Acme' }],
}));

const EN_LABELS = {
	'drawer-connect-title': 'Connect Bluesky',
	'drawer-reconnect-title': 'Reconnect Bluesky account',
	'drawer-identifier-label': 'Bluesky identifier',
	'drawer-identifier-help': 'Your Bluesky handle',
	'drawer-app-password-label': 'App password',
	'drawer-app-password-help': 'Create one at bsky.app settings',
	'drawer-app-password-help-link': 'How do I create an app password?',
	'drawer-submit-connect': 'Connect',
	'drawer-submit-reconnect': 'Reconnect',
	'attach-projects-title': 'Attach projects',
	'attach-projects-none-hint':
		'Leave everything unchecked to publish everywhere.',
	'common:an-error-occurred': 'Something went wrong',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key as keyof typeof EN_LABELS] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { BlueskyConnectDrawer } from './_bluesky-connect-drawer';

afterEach(() => {
	cleanup();
	connectImpl = async () => {};
	reconnectImpl = async () => {};
});

describe('bluesky connect drawer', () => {
	test('ItShouldSubmitIdentifierAndPasswordAndCloseOnSuccess', async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		connectImpl = vi.fn().mockResolvedValue(undefined);

		render(
			<BlueskyConnectDrawer
				mode="connect"
				open
				onOpenChange={onOpenChange}
				tenantId="t1"
			/>,
		);

		await user.type(
			screen.getByTestId('bluesky-identifier'),
			'team.bsky.social',
		);
		await user.type(
			screen.getByTestId('bluesky-app-password'),
			'correct-horse-battery-staple',
		);
		await user.click(screen.getByRole('button', { name: /connect/i }));

		const { waitFor } = await import('@testing-library/react');
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(connectImpl).toHaveBeenCalledWith(
			expect.objectContaining({ identifier: 'team.bsky.social' }),
		);
	});

	test('ItShouldShowTheProviderRefusalAsIsWhenCredentialsAreRefused', async () => {
		const user = userEvent.setup();
		// Rejected value mirrors what the generated Kiota client throws: a
		// record carrying the RFC 7807 body fields that `toApiFailure`
		// parses (`translationKey` + per-field `errors`), NOT a fake
		// `{ status, responseMessageKey }` shape.
		connectImpl = vi.fn().mockRejectedValue({
			status: 422,
			translationKey: 'credentials-refused',
			errors: {
				appPassword: [
					'Bluesky refused these credentials. Check the identifier and app password, then retry.',
				],
			},
		});

		render(
			<BlueskyConnectDrawer
				mode="connect"
				open
				onOpenChange={vi.fn()}
				tenantId="t1"
			/>,
		);

		await user.type(
			screen.getByTestId('bluesky-identifier'),
			'team.bsky.social',
		);
		await user.type(screen.getByTestId('bluesky-app-password'), 'wrong');
		await user.click(screen.getByRole('button', { name: /connect/i }));

		// No jest-dom on this repo: assert on textContent. The surfaced copy
		// is the SERVER's sanitised cause (fieldErrors.appPassword[0]), not a
		// client-invented key. Per the plan's A8 resolution the refusal maps
		// onto the app-password FIELD (setError), so it renders through the
		// shared field-error slot rather than the root role="alert" — the
		// plan's literal role=alert assertion contradicted its own GREEN
		// snippet; the substance guarded here is the verbatim server cause.
		const { waitFor } = await import('@testing-library/react');
		await waitFor(() => {
			const fieldError = screen.getByText(/Bluesky refused these credentials/i);
			expect(fieldError.getAttribute('data-slot')).toBe('field-error');
		});
	});

	test('ItShouldPrefillHandleAndCallReconnectInReconnectMode', async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		reconnectImpl = vi.fn().mockResolvedValue(undefined);

		render(
			<BlueskyConnectDrawer
				mode="reconnect"
				open
				onOpenChange={onOpenChange}
				tenantId="t1"
				account={{
					id: 'a1',
					provider: 'bluesky',
					displayHandle: '@old.bsky.social',
					statusWire: 'needs_reconnect',
					tone: 'warning',
					statusLabelKey: 'settings:status-needs-reconnect',
					lastSuccessAt: null,
					projectIds: ['p1'],
				}}
			/>,
		);

		const identifier = screen.getByTestId(
			'bluesky-identifier',
		) as HTMLInputElement;
		expect(identifier.value).toBe('@old.bsky.social');

		await user.type(
			screen.getByTestId('bluesky-app-password'),
			'fresh-app-password',
		);
		await user.click(screen.getByRole('button', { name: /reconnect/i }));

		const { waitFor } = await import('@testing-library/react');
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(reconnectImpl).toHaveBeenCalledWith(
			expect.objectContaining({ socialAccountId: 'a1' }),
		);
	});
});
