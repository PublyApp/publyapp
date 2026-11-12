/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SocialAccountRow } from '~/lib/query/social-accounts';

let saveImpl: (input: {
	tenantId: string;
	socialAccountId: string;
	visibility: string;
}) => Promise<void> = async () => undefined;

// Spread the REAL module (the visibility list lives there) and override only the mutation.
vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useSetSocialAccountVisibilityMutation: () => ({
		mutateAsync: saveImpl,
		isPending: false,
	}),
}));

const EN_LABELS = {
	'settings:visibility-title': 'Default visibility for {{handle}}',
	'settings:visibility-label': 'Who can see new posts',
	'settings:visibility-help': 'Applies to posts published from now on.',
	'settings:visibility-public': 'Public',
	'settings:visibility-unlisted': 'Unlisted',
	'settings:visibility-private': 'Followers only',
	'settings:visibility-save': 'Save',
	'common:an-error-occurred': 'Something went wrong',
	'common:select-placeholder': 'Select…',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			(EN_LABELS[key as keyof typeof EN_LABELS] ?? key).replace(
				'{{handle}}',
				typeof options?.['handle'] === 'string' ? options['handle'] : '',
			),
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { VisibilityDrawer } from './_visibility-drawer';

const account: SocialAccountRow = {
	id: 'a1',
	provider: 'mastodon',
	displayHandle: 'me@social.example',
	statusWire: 'active',
	tone: 'success',
	statusLabelKey: 'settings:status-active',
	lastSuccessAt: null,
	projectIds: [],
	defaultVisibility: 'unlisted',
};

afterEach(() => {
	cleanup();
	saveImpl = async () => undefined;
});

describe('visibility drawer', () => {
	test('ItShouldShowTheAccountAndItsCurrentVisibility', () => {
		render(
			<VisibilityDrawer
				account={account}
				tenantId="t1"
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByTestId('social-account-visibility-drawer')).toBeTruthy();
		expect(
			screen.getByText('Default visibility for me@social.example'),
		).toBeTruthy();
		expect(screen.getByText('Unlisted')).toBeTruthy();
	});

	test('ItShouldSaveTheChosenVisibilityAndClose', async () => {
		const onOpenChange = vi.fn();
		saveImpl = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup();
		render(
			<VisibilityDrawer
				account={account}
				tenantId="t1"
				onOpenChange={onOpenChange}
			/>,
		);

		await user.click(screen.getByText('Unlisted'));
		await user.click(
			await screen.findByRole('option', { name: 'Followers only' }),
		);
		await user.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() =>
			expect(saveImpl).toHaveBeenCalledWith({
				tenantId: 't1',
				socialAccountId: 'a1',
				visibility: 'private',
			}),
		);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	test('ItShouldKeepTheDrawerOpenAndSayWhyWhenTheSaveFails', async () => {
		const onOpenChange = vi.fn();
		saveImpl = vi.fn().mockRejectedValue({
			status: 422,
			translationKey: 'social-account-visibility-unsupported',
			detail: 'Only Mastodon and Pixelfed accounts have a post visibility.',
		});
		render(
			<VisibilityDrawer
				account={account}
				tenantId="t1"
				onOpenChange={onOpenChange}
			/>,
		);

		await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	test('ItShouldRenderNothingWhileNoAccountIsTargeted', () => {
		render(
			<VisibilityDrawer account={null} tenantId="t1" onOpenChange={vi.fn()} />,
		);

		expect(screen.queryByTestId('social-account-visibility-drawer')).toBeNull();
	});
});
