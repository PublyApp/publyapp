import {
	publicationStatusTone,
	publicationStatusLabelKey,
} from '~/lib/publication-status';
import {
	scheduledLocalCivilDate,
	type ScheduledPublicationRow,
} from '~/lib/query/tenant-scheduled-publications';

export type PublicationWindow = {
	from: Date;
	to: Date;
};

export type ScheduledPublicationDateGroup = {
	date: string;
	rows: ScheduledPublicationRow[];
};

export const buildUpcomingPublicationWindow = (
	now: Date,
): PublicationWindow => ({
	from: new Date(now.valueOf()),
	to: new Date(now.valueOf() + 31 * 24 * 60 * 60 * 1000),
});

export const buildVisibleMonthWindow = (now: Date): PublicationWindow => {
	const year = now.getFullYear();
	const month = now.getMonth();
	return {
		from: new Date(year, month, 1),
		to: new Date(year, month + 1, 1, 0, 0, 0, -1),
	};
};

export const formatScheduledLocalDateTime = (
	scheduledAtLocal: string,
): string => {
	if (!scheduledLocalCivilDate(scheduledAtLocal)) {
		return '—';
	}

	return `${scheduledAtLocal.slice(0, 10)} ${scheduledAtLocal.slice(11, 16)}`;
};

const formatViewerCivilDate = (instant: Date): string => {
	const year = instant.getFullYear();
	const month = String(instant.getMonth() + 1).padStart(2, '0');
	const day = String(instant.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

export const groupScheduledPublicationsByViewerDate = (
	rows: ScheduledPublicationRow[],
): ScheduledPublicationDateGroup[] => {
	const groups = new Map<string, ScheduledPublicationRow[]>();
	for (const row of rows) {
		const date = formatViewerCivilDate(row.scheduledAtUtc);

		const existing = groups.get(date);
		if (existing) {
			existing.push(row);
		} else {
			groups.set(date, [row]);
		}
	}

	return Array.from(groups, ([date, groupedRows]) => ({
		date,
		rows: groupedRows,
	}));
};

/** Re-export the shared publication-status display metadata for backward compat. */
export const scheduledPublicationStatusTone = publicationStatusTone;
export const scheduledPublicationStatusLabelKey = publicationStatusLabelKey;

/** Polling cadence used while at least one publication is in progress or already due. */
const ACTIVE_PUBLICATION_POLL_MS = 5_000;

type NextPollingDelayArgs = {
	rows: ScheduledPublicationRow[];
	now: Date;
};

/**
 * Decides how long the queue page should wait before its next refetch.
 *
 * Returns:
 * - `ACTIVE_PUBLICATION_POLL_MS` when any row is in progress or already due
 * - the minimum positive delay until the next scheduled instant
 * - `null` when nothing in the page is worth polling for (no in-progress,
 *   no scheduled rows, or only paused/published rows)
 */
export const nextPollingDelayMs = ({
	rows,
	now,
}: NextPollingDelayArgs): number | null => {
	let hasActiveOrDue = false;
	let nextDueAt: number | null = null;

	for (const row of rows) {
		if (row.status === 'in_progress') {
			hasActiveOrDue = true;
			continue;
		}

		if (row.status !== 'scheduled') {
			continue;
		}

		const dueAt = row.scheduledAtUtc.valueOf();
		if (!Number.isFinite(dueAt)) {
			continue;
		}

		if (dueAt <= now.valueOf()) {
			hasActiveOrDue = true;
			continue;
		}

		if (nextDueAt === null || dueAt < nextDueAt) {
			nextDueAt = dueAt;
		}
	}

	if (hasActiveOrDue) {
		return ACTIVE_PUBLICATION_POLL_MS;
	}

	if (nextDueAt === null) {
		return null;
	}

	return nextDueAt - now.valueOf();
};
