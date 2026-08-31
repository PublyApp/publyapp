import { useEffect, useRef, useState } from 'react';
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

type CursorCycle = {
	/** Publication IDs seen across all pages, for deduplication. */
	seenIds: Set<string>;
	/** Cursors we have already requested, for cycle detection. */
	seenCursors: Set<string>;
};

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
	const [collectedRows, setCollectedRows] = useState<ScheduledPublicationRow[]>(
		[],
	);
	const [currentPageCursor, setCurrentPageCursor] = useState<
		string | undefined
	>(undefined);
	const [isAggregating, setIsAggregating] = useState(true);
	const cycleRef = useRef<CursorCycle>({
		seenIds: new Set(),
		seenCursors: new Set(),
	});

	// Reset aggregation when the window or statuses change.
	const windowKey = `${pubWindow.from.toISOString()}:${pubWindow.to.toISOString()}:${statuses?.join(',') ?? ''}`;
	const prevWindowKeyRef = useRef(windowKey);
	useEffect(() => {
		if (prevWindowKeyRef.current !== windowKey) {
			prevWindowKeyRef.current = windowKey;
			setCollectedRows([]);
			setCurrentPageCursor(undefined);
			setIsAggregating(true);
			cycleRef.current = { seenIds: new Set(), seenCursors: new Set() };
		}
	}, [windowKey]);

	const query = useScheduledPublicationsQuery({
		tenantId,
		from: pubWindow.from,
		to: pubWindow.to,
		statuses,
		cursor: currentPageCursor,
		limit: initialSize,
	});

	// Process each resolved page.
	useEffect(() => {
		if (!query.data || query.isFetching || query.isPending) {
			return;
		}

		const pageRows = toScheduledPublicationRows(query.data);
		const cycle = cycleRef.current;

		// Deduplicate by publication ID.
		const newRows: ScheduledPublicationRow[] = [];
		for (const row of pageRows) {
			if (!cycle.seenIds.has(row.publicationId)) {
				cycle.seenIds.add(row.publicationId);
				newRows.push(row);
			}
		}

		setCollectedRows((prev) => [...prev, ...newRows]);

		const nextCursor = query.data.nextCursor;
		if (nextCursor && !cycle.seenCursors.has(nextCursor)) {
			// Cursor-cycle detection: if we have seen this cursor before,
			// stop fetching to prevent an infinite loop.
			cycle.seenCursors.add(nextCursor);
			setCurrentPageCursor(nextCursor);
		} else {
			setIsAggregating(false);
		}
	}, [query.data, query.isFetching, query.isPending]);

	const shouldLogout =
		query.error !== null && shouldLogoutForFailure(query.error);

	return {
		rows: collectedRows,
		isAggregating,
		shouldLogout,
		error: query.error,
	};
};
