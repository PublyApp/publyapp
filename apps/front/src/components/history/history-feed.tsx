import { useTranslation } from 'react-i18next';

import { historyDayKey, historyDayLabel } from './history-date';
import { HistoryEventRow } from './history-event-row';
import type { HistoryEvent } from './history-types';

type HistoryDay = {
	key: string;
	date: Date | null;
	events: HistoryEvent[];
};

/** The day's events, each parent followed by the events it caused. */
const flattenDay = (event: HistoryEvent): HistoryEvent[] => [
	event,
	...(event.children ?? []).flatMap((child) => flattenDay(child)),
];

const groupByDay = (events: readonly HistoryEvent[]): HistoryDay[] => {
	const days: HistoryDay[] = [];

	for (const event of events) {
		const key = historyDayKey(event.at);
		const current = days.at(-1);
		const flattened = flattenDay(event);
		if (current !== undefined && current.key === key) {
			current.events.push(...flattened);
			continue;
		}
		days.push({ key, date: event.at, events: flattened });
	}

	return days;
};

/**
 * The shared history's « Par jour » format (§5.1): one heading per day with
 * its event count, the day's events in one bordered box, a line each. Related
 * events sit right under the event that caused them.
 */
export const HistoryFeed = ({
	testId,
	events,
	locale,
	showOrganisation = false,
	onOpen,
	openLabel,
}: {
	testId: string;
	events: readonly HistoryEvent[];
	locale: string;
	showOrganisation?: boolean;
	onOpen: (event: HistoryEvent) => void;
	openLabel: (event: HistoryEvent) => string;
}) => {
	const { t } = useTranslation('common');
	const now = new Date();
	const days = groupByDay(events);
	const labels = {
		today: t('history-day-today'),
		yesterday: t('history-day-yesterday'),
		unknown: t('history-day-unknown'),
	};

	return (
		<div className="flex flex-col gap-5" data-testid={`${testId}-days`}>
			{days.map((day) => (
				<section key={day.key} className="flex flex-col gap-2">
					<h2 className="flex h-8 items-center gap-2 px-1 font-mono text-sm font-medium text-muted-foreground">
						{historyDayLabel({ date: day.date, now, locale, ...labels })}
						<span className="flex h-5 items-center rounded-[10px] bg-secondary px-2 font-sans text-xs text-secondary-foreground tabular-nums">
							{day.events.length}
						</span>
					</h2>
					<ul className="overflow-clip rounded-[var(--publy-radius-control)] border bg-background">
						{day.events.map((event) => (
							<HistoryEventRow
								key={event.id}
								event={event}
								locale={locale}
								showOrganisation={showOrganisation}
								onOpen={onOpen}
								openLabel={openLabel}
							/>
						))}
					</ul>
				</section>
			))}
		</div>
	);
};
