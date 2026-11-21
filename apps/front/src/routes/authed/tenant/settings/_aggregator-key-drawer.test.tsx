/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AggregatorRow } from '~/lib/query/aggregators';

let saveImpl: (input: {
	tenantId: string;
	kind: string;
	apiKey: string;
}) => Promise<void> = async () => undefined;

vi.mock('~/lib/query/aggregators', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useSaveAggregatorKeyMutation: () => ({
		mutateAsync: saveImpl,
		isPending: false,
	}),
}));

const EN_LABELS = {
	'aggregator-drawer-title': 'Partner API key',
	'aggregator-key-label': 'Partner API key',
	'aggregator-key-help': 'Paste your key',
	'aggregator-key-submit': 'Save key',
	'aggregator-key-too-short': 'Too short',
	'aggregator-key-refused': 'Localised: this key was refused.',
	'common:an-error-occurred': 'Something went wrong',
} as const satisfies Record<string, string>;

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key as keyof typeof EN_LABELS] ?? key,
		i18n: { resolvedLanguage: 'fr', language: 'fr' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { AggregatorKeyDrawer } from './_aggregator-key-drawer';

const ROW: AggregatorRow = {
	kind: 'partner',
	displayName: 'Partner',
	keyHelpUrl: 'https://example.com/help',
	supportedPlatforms: ['facebook'],
	connection: null,
};
const KEY = `sk_${'a'.repeat(32)}`;

afterEach(() => {
	cleanup();
	saveImpl = async () => undefined;
});

describe('aggregator key drawer', () => {
	test('ItShouldSendThePastedKeyAndCloseOnSuccess', async () => {
		saveImpl = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();

		render(
			<AggregatorKeyDrawer
				aggregator={ROW}
				onOpenChange={onOpenChange}
				tenantId="t1"
			/>,
		);
		await userEvent.setup().type(screen.getByTestId('aggregator-api-key'), KEY);
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /save key/i }));

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(saveImpl).toHaveBeenCalledWith({
			tenantId: 't1',
			kind: 'partner',
			apiKey: KEY,
		});
	});

	test('ItShouldKeepTheKeyMaskedAsAPasswordField', () => {
		render(
			<AggregatorKeyDrawer
				aggregator={ROW}
				onOpenChange={vi.fn()}
				tenantId="t1"
			/>,
		);

		expect(
			(screen.getByTestId('aggregator-api-key') as HTMLInputElement).type,
		).toBe('password');
	});

	test('ItShouldShowTheLocalisedRefusalOnTheKeyFieldNotTheRawServerSentence', async () => {
		saveImpl = vi.fn().mockRejectedValue({
			status: 422,
			translationKey: 'aggregator-key-refused',
			errors: { apiKey: ['Raw English sentence from the server.'] },
		});
		const onOpenChange = vi.fn();

		render(
			<AggregatorKeyDrawer
				aggregator={ROW}
				onOpenChange={onOpenChange}
				tenantId="t1"
			/>,
		);
		await userEvent.setup().type(screen.getByTestId('aggregator-api-key'), KEY);
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /save key/i }));

		await waitFor(() =>
			expect(screen.getByText('Localised: this key was refused.')).toBeTruthy(),
		);
		expect(screen.queryByText(/raw english sentence/i)).toBeNull();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	test('ItShouldRefuseAKeyThatIsTooShortWithoutCallingTheServer', async () => {
		saveImpl = vi.fn();

		render(
			<AggregatorKeyDrawer
				aggregator={ROW}
				onOpenChange={vi.fn()}
				tenantId="t1"
			/>,
		);
		await userEvent
			.setup()
			.type(screen.getByTestId('aggregator-api-key'), 'sk_1');
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /save key/i }));

		await waitFor(() => expect(screen.getByText('Too short')).toBeTruthy());
		expect(saveImpl).not.toHaveBeenCalled();
	});
});
