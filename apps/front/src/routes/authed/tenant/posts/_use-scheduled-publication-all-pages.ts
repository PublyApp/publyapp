import { useCallback, useEffect, useState } from 'react';
import {
	toScheduledPublicationRows,
	useScheduledPublicationsQuery,
	type ScheduledPublicationRow,
} from '~/lib/query/tenant-scheduled-publications';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import type { PublicationWindow } from './_scheduled-publication-helpers';

type ScheduledPublicationAllPagesOptions = {
	tenantId: string;
	window: PublicationWindow;
	initialSize: number;
	statuses?: string[];
};

type AggregationState = {
	/** Rows collected across every page so far, deduplicated by id. */
	rows: ScheduledPublicationRow[];
	/** Cursor of the page being fetched, if any. */
	cursor: string | undefined;
	/** Publication IDs already collected, for deduplication. */
	seenIds: Set<string>;
	/** Cursors already requested, for cycle detection. */
	seenCursors: Set<string>;
	/** Set when the walk ends or stops on an error. */
	completed: boolean;
};

const createAggregation = (): AggregationState => ({
	rows: [],
	cursor: undefined,
	seenIds: new Set(),
	seenCursors: new Set(),
	completed: false,
});

/**
 * Fetches and aggregates every cursor page for a bounded window.
 * Used by the calendar to show the complete visible month. Queue keeps
 * interactive page replacement via `useScheduledPublicationPage`.
 */
export const useScheduledPublicationAllPages = ({
	tenantId,
	window: pubWindow,
	initialSize,
	statuses,
}: ScheduledPublicationAllPagesOptions) => {
	const [aggregation, setAggregation] =
		useState<AggregationState>(createAggregation);

	const [restartKey, setRestartKey] = useState(0);

	// Tenant identity belongs to the walk, so a tenant switch clears rows
	// synchronously instead of briefly painting the previous tenant's data.
	const scopeKey = `${tenantId}:${pubWindow.from.toISOString()}:${pubWindow.to.toISOString()}:${statuses?.join(',') ?? ''}`;

	// Reset during render so no frame can observe stale rows or cursor state.
	const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
	if (prevScopeKey !== scopeKey) {
		setPrevScopeKey(scopeKey);
		setAggregation(createAggregation());
	}

	const queryVariables = {
		tenantId,
		from: pubWindow.from,
		to: pubWindow.to,
		statuses,
		cursor: aggregation.cursor,
		limit: initialSize,
		restartKey,
	} satisfies Parameters<typeof useScheduledPublicationsQuery>[0] & {
		restartKey: number;
	};
	const query = useScheduledPublicationsQuery(queryVariables);

	// An error terminates the cursor walk so the error surface can render.
	useEffect(() => {
		if (!query.error) {
			return;
		}
		setAggregation((prev) =>
			prev.completed ? prev : { ...prev, completed: true },
		);
	}, [query.error]);

	// Process each resolved page: collect new rows, advance the cursor, and
	// mark the walk complete when the page ends it (cursor-cycle detection
	// stops an infinite loop). The updater stays pure — dedupe and cursor
	// memory travel inside the state instead of a mutable ref.
	useEffect(() => {
		if (query.error || !query.data || query.isFetching || query.isPending) {
			return;
		}

		const pageRows = toScheduledPublicationRows(query.data);
		const nextCursor = query.data.nextCursor;

		setAggregation((prev) => {
			if (prev.completed) {
				return prev;
			}

			const seenIds = new Set(prev.seenIds);
			const newRows: ScheduledPublicationRow[] = [];
			for (const row of pageRows) {
				if (!seenIds.has(row.publicationId)) {
					seenIds.add(row.publicationId);
					newRows.push(row);
				}
			}

			const cursorIsUnseen =
				nextCursor != null &&
				nextCursor !== '' &&
				!prev.seenCursors.has(nextCursor);
			const completed = !cursorIsUnseen;
			const seenCursors =
				cursorIsUnseen && nextCursor !== null
					? new Set(prev.seenCursors).add(nextCursor)
					: prev.seenCursors;

			return {
				rows: [...prev.rows, ...newRows],
				cursor: cursorIsUnseen ? nextCursor : prev.cursor,
				seenIds,
				seenCursors,
				completed,
			};
		});
	}, [query.data, query.error, query.isFetching, query.isPending]);

	const restart = useCallback(() => {
		setAggregation(createAggregation());
		setRestartKey((tick) => tick + 1);
	}, []);

	// Derived loading flag — computed during render, never synchronized in
	// an effect. Aggregation is ongoing while the current page is pending
	// or being fetched, or while the walk has not yet reached its end.
	const isAggregating =
		query.isPending || query.isFetching || !aggregation.completed;

	const shouldLogout =
		query.error !== null && shouldLogoutForFailure(query.error);

	return {
		rows: aggregation.rows,
		isAggregating,
		shouldLogout,
		error: query.error,
		restart,
	};
};
