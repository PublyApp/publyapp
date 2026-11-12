/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

let startImpl: (input: {
	tenantId: string;
	instance: string;
	provider: string;
	socialAccountId?: string;
}) => Promise<string> = async () => '';

vi.mock('~/lib/query/mastodon-connect', () => ({
	useStartMastodonConnectMutation: () => ({
		mutateAsync: startImpl,
		isPending: false,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			`${key}|${Object.values(options ?? {}).join(',')}`,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { ReconnectMismatchDialog } from './_reconnect-mismatch-dialog';

const mismatch = {
	expectedHandle: 'alice@social.example',
	actualHandle: 'bob@social.example',
	provider: 'mastodon' as const,
	instance: 'social.example',
};

const assign = vi.fn();

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	assign.mockReset();
	startImpl = async () => '';
});

describe('reconnect mismatch dialog', () => {
	test('ItShouldNameBothAccountsAndStateNothingWasChanged', () => {
		render(
			<ReconnectMismatchDialog
				mismatch={mismatch}
				tenantId="t1"
				onClose={vi.fn()}
			/>,
		);

		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain(
			'settings:mastodon-mismatch-description|bob@social.example,alice@social.example',
		);
		expect(
			screen.getByText('settings:mastodon-mismatch-keep|alice@social.example'),
		).toBeTruthy();
	});

	test('ItShouldConnectTheOtherAccountAsNewWithoutAReconnectTarget', async () => {
		vi.stubGlobal('location', { assign, href: '', origin: 'http://localhost' });
		startImpl = vi
			.fn()
			.mockResolvedValue('https://social.example/oauth/authorize?state=s9');
		render(
			<ReconnectMismatchDialog
				mismatch={mismatch}
				tenantId="t1"
				onClose={vi.fn()}
			/>,
		);

		await userEvent
			.setup()
			.click(
				screen.getByText(
					'settings:mastodon-mismatch-connect-new|bob@social.example',
				),
			);

		await waitFor(() =>
			expect(assign).toHaveBeenCalledWith(
				'https://social.example/oauth/authorize?state=s9',
			),
		);
		expect(startImpl).toHaveBeenCalledWith({
			tenantId: 't1',
			instance: 'social.example',
			provider: 'mastodon',
		});
	});

	test('ItShouldLeaveTheOldAccountAloneWhenTheUserKeepsIt', async () => {
		const onClose = vi.fn();
		render(
			<ReconnectMismatchDialog
				mismatch={mismatch}
				tenantId="t1"
				onClose={onClose}
			/>,
		);

		await userEvent
			.setup()
			.click(
				screen.getByText(
					'settings:mastodon-mismatch-keep|alice@social.example',
				),
			);

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(assign).not.toHaveBeenCalled();
	});

	test('ItShouldSayWhyWhenStartingTheNewConnectionFails', async () => {
		startImpl = vi.fn().mockRejectedValue({
			status: 429,
			detail: 'Too many new servers were connected recently.',
		});
		render(
			<ReconnectMismatchDialog
				mismatch={mismatch}
				tenantId="t1"
				onClose={vi.fn()}
			/>,
		);

		await userEvent
			.setup()
			.click(
				screen.getByText(
					'settings:mastodon-mismatch-connect-new|bob@social.example',
				),
			);

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
	});

	test('ItShouldRenderNothingWithoutAMismatch', () => {
		render(
			<ReconnectMismatchDialog
				mismatch={null}
				tenantId="t1"
				onClose={vi.fn()}
			/>,
		);

		expect(screen.queryByRole('alertdialog')).toBeNull();
	});
});
