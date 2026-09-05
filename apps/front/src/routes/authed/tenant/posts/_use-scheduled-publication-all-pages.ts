import { useEffect, useState } from 'react';
import {
	toScheduledPublicationRows,
	useScheduledPublicationsInfiniteQuery,
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

/**
 * Walks every cursor page of `posts.publications.get` for one bounded window
 * via TanStack's `useInfiniteQuery`. The rows live in the query cache
 * (key = `tenant / tenant-scheduled-publications / tenantId /
 * window+status+limit payload / restartKey`); `invalidateQueries` against
 * the tenant scope refetches every page, so the calendar's view of the
 * walk stays complete after server-side changes — there is no React-state
 * shadow to drift.
 *
 * Per-page dedupe happens in `flattenPages`, which preserves backend order
 * across the flattened list. The cursor-cycle guard lives inside the
 * infinite query's `getNextPageParam`: a server that hands back a
 * `nextCursor` we've already requested terminates the walk instead of
 * looping. A terminal error on any page also stops the walk because
 * `fetchNextPage` is never called for an errored query.
 *
 * Tenant isolation is preserved by encoding `tenantId` in the cache key —
 * switching tenants remounts a fresh query and the previous tenant's
 * pending pages cannot land in the new tenant's walk.
 *
 * `restart()` bumps `restartKey` so the `useInfiniteQuery` cache slot is
 * rebuilt from scratch — `refetch()` on an errored infinite query can leave
 * stale partial pages in the cache, so remounting is the deterministic way
 * to start a clean walk.
 */
export const useScheduledPublicationAllPages = ({
	tenantId,
	window: pubWindow,
	initialSize,
	statuses,
}: ScheduledPublicationAllPagesOptions) => {
	const [restartKey, setRestartKey] = useState(0);

	const {
		error,
		hasNextPage,
		isPending,
		isFetchingNextPage,
		fetchNextPage,
		data,
	} = useScheduledPublicationsInfiniteQuery({
		tenantId,
		from: pubWindow.from,
		to: pubWindow.to,
		statuses,
		limit: initialSize,
		restartKey,
	});

	// Drive the cursor walk forward until the server stops handing back
	// `nextCursor`. We only `fetchNextPage` when there IS a next page
	// (`hasNextPage`) and the current attempt is idle, so a successful
	// resolution of page N naturally schedules page N+1; a failure stops
	// the walk because `fetchNextPage` is never called for an errored
	// `isFetchingNextPage` attempt. The effect depends only on the
	// stable primitives so the `infinite` object reference can change
	// without retriggering the walk.
	useEffect(() => {
		if (error !== null || !hasNextPage || isFetchingNextPage) {
			return;
		}
		void fetchNextPage();
	}, [error, hasNextPage, isFetchingNextPage, fetchNextPage]);

	// Flatten + dedupe across the cached pages. React Compiler handles
	// memoisation, so this stays as a direct computation.
	const pages = data?.pages ?? [];
	const seenIds = new Set<string>();
	const rows: ScheduledPublicationRow[] = [];
	for (const page of pages) {
		for (const row of toScheduledPublicationRows(page)) {
			if (!seenIds.has(row.publicationId)) {
				seenIds.add(row.publicationId);
				rows.push(row);
			}
		}
	}

	const restart = () => {
		setRestartKey((tick) => tick + 1);
	};

	// Derived loading flag — the walk is ongoing while the first page has
	// not landed, while a subsequent page is being fetched, or while the
	// server has indicated another page is available. A terminal error
	// stops the walk even when `hasNextPage` is technically still true
	// (the next-page signal was computed before the failure landed), so
	// the page's error surface can take over the render.
	const isAggregating =
		error === null && (isPending || hasNextPage || isFetchingNextPage);

	const shouldLogout = error !== null && shouldLogoutForFailure(error);

	return {
		rows,
		isAggregating,
		shouldLogout,
		error,
		restart,
	};
};
