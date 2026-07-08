/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { DataTable } from './data-table';

afterEach(cleanup);

const noop = () => undefined;

const baseProps = {
	testId: 'test-table',
	ariaLabel: 'Test table',
	columns: [],
	rows: [],
	isPending: false,
	isError: true,
	onRetry: noop,
	hasActiveSearch: false,
	sort: { id: 'name', order: 'asc' } as const,
	onSortChange: noop,
	size: 20,
	onSizeChange: noop,
	pageIndex: 0,
	hasPreviousPage: false,
	hasNextPage: false,
	isPaginationPending: false,
	onNextPage: noop,
	onPreviousPage: noop,
	searchDraft: '',
	onSearchDraftChange: noop,
};

describe('DataTable errorContent', () => {
	test('renders default fallback message when no errorContent is provided', () => {
		render(<DataTable {...baseProps} />);
		expect(
			screen.getByText('There was a problem loading this list.'),
		).toBeTruthy();
	});

	test('uses string errorContent as the error description', () => {
		render(
			<DataTable
				{...baseProps}
				errorContent="Unable to load tenants right now."
			/>,
		);
		expect(screen.getByText('Unable to load tenants right now.')).toBeTruthy();
		expect(screen.getByText('Retry')).toBeTruthy();
	});

	test('renders ReactNode errorContent alongside the Retry button', () => {
		render(
			<DataTable
				{...baseProps}
				errorContent={
					<p data-testid="custom-error">
						You do not have permission to view this list.
					</p>
				}
			/>,
		);
		expect(
			screen.getByText('You do not have permission to view this list.'),
		).toBeTruthy();
		expect(screen.getByTestId('custom-error')).toBeTruthy();
		expect(screen.getByText('Retry')).toBeTruthy();
	});

	test('default description is hidden when ReactNode errorContent is provided', () => {
		render(
			<DataTable
				{...baseProps}
				errorContent={<span>Custom error node</span>}
			/>,
		);
		expect(screen.getByText('Custom error node')).toBeTruthy();
		expect(
			screen.queryByText('There was a problem loading this list.'),
		).toBeNull();
		expect(screen.getByText('Retry')).toBeTruthy();
	});
});
