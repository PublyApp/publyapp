import { useState } from 'react';
import { useCursorPagination } from '~/components/table/use-cursor-pagination';
import {
	toScheduledPublicationRows,
	useScheduledPublicationsQuery,
} from '~/lib/query/tenant-scheduled-publications';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import type { PublicationWindow } from './_scheduled-publication-helpers';

type ScheduledPublicationPageOptions = {
	tenantId: string;
	createWindow: () => PublicationWindow;
	initialSize: number;
	statuses?: string[];
};

export const useScheduledPublicationPage = ({
	tenantId,
	createWindow,
	initialSize,
	statuses,
}: ScheduledPublicationPageOptions) => {
	const [window] = useState(createWindow);
	const [size, setSize] = useState(initialSize);
	const scopeKey = `${tenantId}:${window.from.toISOString()}:${window.to.toISOString()}:${statuses?.join(',') ?? ''}`;
	const cursorPagination = useCursorPagination({
		sortId: 'scheduled_at',
		sortOrder: 'asc',
		size,
		scopeKey,
	});
	const query = useScheduledPublicationsQuery({
		tenantId,
		from: window.from,
		to: window.to,
		statuses,
		cursor: cursorPagination.cursor,
		limit: size,
	});
	const rows = toScheduledPublicationRows(query.data);
	const nextCursor = query.data?.nextCursor ?? null;

	return {
		query,
		rows,
		shouldLogout: query.error !== null && shouldLogoutForFailure(query.error),
		pagination: {
			pageIndex: cursorPagination.pageIndex,
			size,
			hasPreviousPage: cursorPagination.hasPreviousPage,
			hasNextPage: nextCursor !== null,
			isPaginationPending: query.isFetching,
			onNextPage: () => {
				if (nextCursor) {
					cursorPagination.advance(nextCursor);
				}
			},
			onPreviousPage: cursorPagination.retreat,
			onSizeChange: setSize,
		},
	};
};
