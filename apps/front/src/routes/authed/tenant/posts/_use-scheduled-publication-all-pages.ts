import { useEffect, useState } from 'react';
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
	/** Set when the last processed page ends the walk (no next cursor, or an
	 * already-seen cursor). */
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

	// Window identity (ISO instants + statuses) of the aggregation currently
	// in flight.
	const windowKey = `${pubWindow.from.toISOString()}:${pubWindow.to.toISOString()}:${statuses?.join(',') ?? ''}`;

	// Reset aggregation when the window or statuses change. This is the
	// canonical "adjusting some state when a prop changes" pattern
	// (react.dev/learn/you-might-not-need-an-effect): compare the current
	// window identity against the one the previous render committed, and
	// reset state during render instead of inside an effect. React re-renders
	// immediately, so no frame can observe stale rows, cursors, or dedupe
	// memory from the previous window.
	const [prevWindowKey, setPrevWindowKey] = useState(windowKey);
	if (prevWindowKey !== windowKey) {
		setPrevWindowKey(windowKey);
		setAggregation(createAggregation());
	}

	const query = useScheduledPublicationsQuery({
		tenantId,
		from: pubWindow.from,
		to: pubWindow.to,
		statuses,
		cursor: aggregation.cursor,
		limit: initialSize,
	});

	// Process each resolved page: collect new rows, advance the cursor, and
	// mark the walk complete when the page ends it (cursor-cycle detection
	// stops an infinite loop). The updater stays pure — dedupe and cursor
	// memory travel inside the state instead of a mutable ref.
	useEffect(() => {
		if (!query.data || query.isFetching || query.isPending) {
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
	}, [query.data, query.isFetching, query.isPending]);

	// Derived loading flag — computed during render, never synchronized in an
	// effect. Aggregation is ongoing while the current page is pending or
	// being fetched, or while the walk has not yet reached its end.
	const isAggregating =
		query.isPending || query.isFetching || !aggregation.completed;

	const shouldLogout =
		query.error !== null && shouldLogoutForFailure(query.error);

	return {
		rows: aggregation.rows,
		isAggregating,
		shouldLogout,
		error: query.error,
	};
};
