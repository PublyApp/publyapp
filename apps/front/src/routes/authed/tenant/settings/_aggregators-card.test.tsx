/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AggregatorRow } from '~/lib/query/aggregators';

const mocks = vi.hoisted(() => ({
	data: { aggregators: [] as unknown[] },
	error: null as Error | null,
}));

vi.mock('~/lib/query/aggregators', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useAggregatorsQuery: () => ({
		data: mocks.error ? undefined : mocks.data,
		isPending: false,
		isLoading: false,
		isFetching: false,
		isError: mocks.error !== null,
		error: mocks.error,
		refetch: vi.fn(),
	}),
	useTestAggregatorKeyMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('./_remove-aggregator-key-dialog', () => ({
	RemoveAggregatorKeyDialog: ({
		aggregator,
	}: {
		aggregator: { displayName: string } | null;
	}) =>
		aggregator ? (
			<div data-testid="remove-dialog">{aggregator.displayName}</div>
		) : null,
}));

vi.mock('./_aggregator-key-drawer', () => ({
	AggregatorKeyDrawer: () => null,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) =>
			options?.['hint'] ? `${key}:${options['hint']}` : key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { AggregatorsCard } from './_aggregators-card';

const WIRE = {
	kind: 'partner',
	displayName: 'Partner',
	keyHelpUrl: 'https://example.com/help',
	supportedPlatforms: ['facebook'],
	connection: null,
} satisfies Partial<AggregatorRow>;

afterEach(() => {
	cleanup();
	mocks.error = null;
});

describe('aggregators card', () => {
	test('ItShouldOfferToConnectWhenNoKeyIsSaved', () => {
		mocks.data = { aggregators: [WIRE] };

		render(<AggregatorsCard tenantId="t1" canManage />);

		expect(screen.getByText('aggregator-not-connected')).toBeTruthy();
		expect(screen.getByText('aggregator-connect')).toBeTruthy();
		expect(screen.queryByText('aggregator-remove-key')).toBeNull();
	});

	test('ItShouldShowOnlyTheKeyHintAndTheActionsWhenConnected', () => {
		mocks.data = {
			aggregators: [
				{
					...WIRE,
					connection: {
						status: 'active',
						keyHint: 'a1b2',
						lastCheckedAt: null,
						lastError: null,
					},
				},
			],
		};

		render(<AggregatorsCard tenantId="t1" canManage />);

		expect(screen.getByText('aggregator-key-hint:a1b2')).toBeTruthy();
		expect(screen.getByText('aggregator-test-key')).toBeTruthy();
		expect(screen.getByText('aggregator-remove-key')).toBeTruthy();
	});

	test('ItShouldHideEveryActionWithoutThePermission', () => {
		mocks.data = { aggregators: [WIRE] };

		render(<AggregatorsCard tenantId="t1" canManage={false} />);

		expect(screen.queryByText('aggregator-connect')).toBeNull();
	});

	test('ItShouldAskForConfirmationInsteadOfRemovingTheKeyOnClick', () => {
		mocks.data = {
			aggregators: [
				{
					...WIRE,
					connection: {
						status: 'active',
						keyHint: 'a1b2',
						lastCheckedAt: null,
						lastError: null,
					},
				},
			],
		};

		render(<AggregatorsCard tenantId="t1" canManage />);
		expect(screen.queryByTestId('remove-dialog')).toBeNull();
		fireEvent.click(screen.getByText('aggregator-remove-key'));

		expect(screen.getByTestId('remove-dialog').textContent).toBe('Partner');
	});

	test('ItShouldRenderNothingForAMemberRefusedTheList', () => {
		mocks.error = Object.assign(new Error('forbidden'), { status: 403 });

		const { container } = render(
			<AggregatorsCard tenantId="t1" canManage={false} />,
		);

		expect(container.innerHTML).toBe('');
	});
});
