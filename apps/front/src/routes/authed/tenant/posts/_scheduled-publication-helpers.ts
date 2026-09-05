import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

export type PublicationWindow = {
	from: Date;
	to: Date;
};

export type ScheduledPublicationDateGroup = {
	date: string;
	rows: ScheduledPublicationRow[];
};

/** API maximum window = 32 days (PublicationService.FindScheduledAsync). The
 * queue window must respect it: past grace + future horizon combined must stay
 * strictly <= 32 days so the server never 422s. */
const PAST_GRACE_MS = 24 * 60 * 60 * 1_000;
const FUTURE_HORIZON_MS = 31 * 24 * 60 * 60 * 1_000;

export const buildUpcomingPublicationWindow = (
	now: Date,
): PublicationWindow => {
	// 24 hours of past visibility so a publication whose worker pickup window
	// races the page open still surfaces and the queue can start polling for
	// its in-flight transition. A full 31-day future horizon means every
	// scheduled publication in the coming month shows, and the window totals
	// 32 days — the API rejects only `> 32` days, never `== 32`. A row due
	// seconds before the page opens sits inside FromUtc; an old scheduled row
	// more than 24h in the past stays out.
	return {
		from: new Date(now.valueOf() - PAST_GRACE_MS),
		to: new Date(now.valueOf() + FUTURE_HORIZON_MS),
	};
};

export const buildVisibleMonthWindow = (now: Date): PublicationWindow => {
	const year = now.getFullYear();
	const month = now.getMonth();
	return {
		from: new Date(year, month, 1),
		to: new Date(year, month + 1, 1, 0, 0, 0, -1),
	};
};

export const formatCalendarDay = (date: string, language: string): string => {
	const value = new Date(`${date}T00:00:00.000Z`);
	if (Number.isNaN(value.valueOf())) {
		return '—';
	}

	return new Intl.DateTimeFormat(language, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(value);
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

/** Polling cadence used while at least one publication is in progress or already due. */
const ACTIVE_PUBLICATION_POLL_MS = 5_000;
/** Recheck long waits daily, safely below browsers' signed 32-bit timer limit. */
const MAX_PUBLICATION_POLL_WAIT_MS = 24 * 60 * 60 * 1_000;

type NextPollingDelayArgs = {
	rows: ScheduledPublicationRow[];
	now: Date;
};

/**
 * Decides how long the queue page should wait before its next refetch.
 *
 * Returns:
 * - `ACTIVE_PUBLICATION_POLL_MS` when any row is in progress or already due
 * - the minimum positive delay until the next scheduled instant, capped at one day
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

	return Math.min(nextDueAt - now.valueOf(), MAX_PUBLICATION_POLL_WAIT_MS);
};
