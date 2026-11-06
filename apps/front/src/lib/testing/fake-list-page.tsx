import type { ReactNode } from 'react';

type FakeColumn<T> = {
	id: string;
	cell: (row: T) => ReactNode;
};

type FakeListPageProps<T extends { id: string }> = {
	testId?: string;
	rows: T[];
	columns: FakeColumn<T>[];
	renderActions?: (row: T) => ReactNode;
	emptyText?: string;
	queryState?: { isPending: boolean; isError: boolean };
	after?: ReactNode;
};

/**
 * A deliberately dumb stand-in for the generic list page, for route tests that
 * assert a page's cells and row actions rather than the list chrome. It keeps
 * the page's real column definitions and action menu in the tree, so a broken
 * cell or a swallowed action still fails the test.
 */
export const FakeListPage = <T extends { id: string }>({
	testId,
	rows,
	columns,
	renderActions,
	emptyText,
	queryState,
	after,
}: FakeListPageProps<T>) => {
	if (queryState?.isPending) {
		return <div data-testid={testId} data-state="loading" />;
	}
	if (queryState?.isError) {
		return <div data-testid={testId} data-state="error" />;
	}
	if (rows.length === 0) {
		return (
			<div data-testid={testId}>
				<p>{emptyText ?? 'list-empty'}</p>
				{after}
			</div>
		);
	}
	return (
		<div data-testid={testId}>
			{rows.map((row) => (
				<div key={row.id} data-testid={`row-${row.id}`}>
					{columns.map((column) => (
						<span key={column.id} data-testid={`cell-${column.id}-${row.id}`}>
							{column.cell(row)}
						</span>
					))}
					{renderActions?.(row)}
				</div>
			))}
			{after}
		</div>
	);
};
