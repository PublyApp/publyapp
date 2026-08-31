import type { StatusPillTone } from '~/components/ui/status-tone';
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

export const scheduledPublicationStatusTone = (
	status: string | null,
): StatusPillTone => {
	if (status === 'in_progress') {
		return 'info';
	}
	if (status === 'paused') {
		return 'warning';
	}
	if (status === 'published') {
		return 'success';
	}
	if (status === 'failed') {
		return 'danger';
	}
	return 'neutral';
};

export const scheduledPublicationStatusLabelKey = (
	status: string | null,
): string | null => {
	if (status === 'scheduled') {
		return 'publish-status-scheduled';
	}
	if (status === 'in_progress') {
		return 'publish-status-in-progress';
	}
	if (status === 'paused') {
		return 'publish-status-paused';
	}
	if (status === 'published') {
		return 'publish-status-published';
	}
	if (status === 'failed') {
		return 'publish-status-failed';
	}
	return null;
};
