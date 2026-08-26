/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SocialAccountRow } from '~/lib/query/social-accounts';

let disconnectImpl: (input: {
	socialAccountId: string;
}) => Promise<void> = async () => {};

vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useDisconnectSocialAccountMutation: () => ({
		mutateAsync: disconnectImpl,
		isPending: false,
	}),
}));

const EN_LABELS = {
	'disconnect-title': 'Disconnect account',
	'disconnect-consequences':
		'Disconnecting pauses every scheduled post on {{handle}}, erases the stored credentials, and keeps your publication history. Reconnecting the same account resumes posts whose date is still ahead.',
	disconnect: 'Disconnect',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) => {
			const template = EN_LABELS[key as keyof typeof EN_LABELS] ?? key;
			if (!opts) {
				return template;
			}
			return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
				typeof opts[name] === 'string' ? (opts[name] as string) : `{{${name}}}`,
			);
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { DisconnectDialog } from './_disconnect-dialog';

const ACCOUNT = {
	id: 'a1',
	provider: 'bluesky',
	displayHandle: '@team.bsky.social',
	statusWire: 'active',
	tone: 'success',
	statusLabelKey: 'settings:status-active',
	lastSuccessAt: null,
	projectIds: [],
} satisfies SocialAccountRow;

afterEach(() => {
	cleanup();
	disconnectImpl = async () => {};
});

describe('disconnect dialog', () => {
	test('ItShouldNameTheConsequencesBeforeConfirming', () => {
		render(
			<DisconnectDialog
				account={ACCOUNT}
				isOpen
				onOpenChange={vi.fn()}
				tenantId="t1"
			/>,
		);

		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toMatch(/pauses every scheduled post/i);
		expect(dialog.textContent).toMatch(/erases the stored credentials/i);
		expect(dialog.textContent).toMatch(/keeps your publication history/i);
		expect(dialog.textContent).toContain('@team.bsky.social');
	});

	test('ItShouldCallDisconnectOnlyAfterExplicitConfirmation', async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		disconnectImpl = vi.fn().mockResolvedValue(undefined);

		render(
			<DisconnectDialog
				account={ACCOUNT}
				isOpen
				onOpenChange={onOpenChange}
				tenantId="t1"
			/>,
		);

		await user.click(screen.getByRole('button', { name: /disconnect/i }));

		expect(disconnectImpl).toHaveBeenCalledWith(
			expect.objectContaining({ socialAccountId: 'a1' }),
		);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});
});
