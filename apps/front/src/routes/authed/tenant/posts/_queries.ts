import {
	scheduledPublicationsInfiniteQueryOptions,
	scheduledPublicationsQueryOptions,
} from '~/lib/query/tenant-scheduled-publications';
import { tenantsForPickerQueryOptions } from '~/lib/query/tenants-for-picker';

import {
	buildUpcomingPublicationWindow,
	buildVisibleMonthWindow,
} from './_scheduled-publication-helpers';

/** What the queue lists, and the size of its first page. The page and the spec
 * read the same values so the loader warms the key the page mounts on. */
export const QUEUE_STATUSES = ['scheduled', 'in_progress', 'paused'] as const;
export const QUEUE_PAGE_SIZE = 20;

/** A destination can still be customized until it is published: scheduled,
 * paused and failed rows (a failed one is fixed by customizing, then retrying). */
export const CUSTOMIZABLE_STATUSES = ['scheduled', 'paused', 'failed'];

/** The calendar walks every page of the month, 100 rows at a time. */
export const CALENDAR_PAGE_SIZE = 100;

/** The queue's first page. The cursor lives in React state (decision 4), so
 * the spec pins the first page: `cursor: undefined`. */
export const postQueueQueries = ({ tenantId }: { tenantId: string }) => {
	const window = buildUpcomingPublicationWindow(new Date());

	return {
		scheduledPublications: {
			options: scheduledPublicationsQueryOptions,
			variables: {
				tenantId,
				from: window.from,
				to: window.to,
				statuses: [...QUEUE_STATUSES],
				cursor: undefined,
				limit: QUEUE_PAGE_SIZE,
			},
		},
		picker: { options: tenantsForPickerQueryOptions, variables: {} },
	};
};

/** The calendar's infinite walk. The spec owns the initial key: `restartKey:
 * 0`, the value a fresh mount reads (decision 4). */
export const postCalendarQueries = ({ tenantId }: { tenantId: string }) => {
	const window = buildVisibleMonthWindow(new Date());

	return {
		scheduledPublications: {
			options: scheduledPublicationsInfiniteQueryOptions,
			variables: {
				tenantId,
				from: window.from,
				to: window.to,
				statuses: undefined,
				limit: CALENDAR_PAGE_SIZE,
				restartKey: 0,
			},
		},
		picker: { options: tenantsForPickerQueryOptions, variables: {} },
	};
};
