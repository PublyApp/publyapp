/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AggregatorRow } from '~/lib/query/aggregators';

let removeImpl: (input: {
	tenantId: string;
	kind: string;
}) => Promise<void> = async () => undefined;

vi.mock('~/lib/query/aggregators', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useRemoveAggregatorKeyMutation: () => ({
		mutateAsync: removeImpl,
		isPending: false,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) =>
			`${key}|${options?.['name'] ?? ''}`,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { RemoveAggregatorKeyDialog } from './_remove-aggregator-key-dialog';

const ROW: AggregatorRow = {
	kind: 'partner',
	displayName: 'Partner',
	keyHelpUrl: '',
	supportedPlatforms: [],
	connection: null,
};

afterEach(cleanup);

describe('remove aggregator key dialog', () => {
	test('ItShouldNameTheAggregatorAndTheConsequenceBeforeRemoving', () => {
		render(
			<RemoveAggregatorKeyDialog
				aggregator={ROW}
				onOpenChange={vi.fn()}
				tenantId="t1"
			/>,
		);

		expect(screen.getByText('aggregator-remove-title|Partner')).toBeTruthy();
		expect(
			screen.getByText('aggregator-remove-consequences|Partner'),
		).toBeTruthy();
	});

	test('ItShouldRemoveTheKeyOnlyAfterTheUserConfirms', async () => {
		removeImpl = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();

		render(
			<RemoveAggregatorKeyDialog
				aggregator={ROW}
				onOpenChange={onOpenChange}
				tenantId="t1"
			/>,
		);
		expect(removeImpl).not.toHaveBeenCalled();
		await userEvent
			.setup()
			.click(screen.getByRole('button', { name: /aggregator-remove-key/ }));

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(removeImpl).toHaveBeenCalledWith({
			tenantId: 't1',
			kind: 'partner',
		});
	});

	test('ItShouldStayClosedWithoutAnAggregator', () => {
		render(
			<RemoveAggregatorKeyDialog
				aggregator={null}
				onOpenChange={vi.fn()}
				tenantId="t1"
			/>,
		);

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
