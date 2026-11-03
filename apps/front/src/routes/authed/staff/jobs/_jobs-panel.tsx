import {
	IconAlertTriangle,
	IconList,
	IconSettingsAutomation,
} from '@tabler/icons-react';
import type { ListPanelGroup } from '~/components/list/filter-panel';
import type {
	ListFilter,
	ListFiltersValue,
} from '~/components/list/list-types';

import type { JobsOverview } from './_jobs-overview';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type JobsSection = 'queue' | 'dead' | 'system';

export type JobsSectionPaths = {
	queue: '/staff/jobs';
	dead: '/staff/jobs/dead-letter';
	system: '/staff/jobs/system-jobs';
};

const SECTION_PATHS: JobsSectionPaths = {
	queue: '/staff/jobs',
	dead: '/staff/jobs/dead-letter',
	system: '/staff/jobs/system-jobs',
};

/**
 * The jobs side panel: the three-section group with whole-collection counts,
 * then the page's filter shortcuts. Counts come from `useJobsOverview` and
 * respect the search only (never the other filters), as §2.2 requires; a
 * count is « — » when its collection is not fully known.
 */
export const buildJobsPanelGroups = <T,>({
	t,
	current,
	overview,
	filterCounts,
	filters,
	filtersValue,
	onSection,
	onShortcut,
}: {
	t: Translate;
	current: JobsSection;
	overview: JobsOverview;
	/** API facet counts for the page's filter shortcuts, keyed filter/value.
	 * `null` is a genuinely unavailable facet (« — »), not a page sum. */
	filterCounts: Record<string, Record<string, number | null>>;
	filters: ListFilter<T>[];
	filtersValue: ListFiltersValue;
	onSection: (section: JobsSection) => void;
	onShortcut: (filterKey: string, value: string) => void;
}): ListPanelGroup[] => {
	const sections: ListPanelGroup = {
		key: 'jobs-sections',
		title: t('common:nav-staff-jobs'),
		entries: [
			{
				key: 'queue',
				label: t('common:nav-staff-jobs-queue'),
				icon: <IconList />,
				count: overview.counts.queue,
				active: current === 'queue',
				onClick: () => onSection('queue'),
			},
			{
				key: 'dead',
				label: t('common:nav-staff-jobs-dead-letter'),
				icon: <IconAlertTriangle />,
				count: overview.counts.deadLetters,
				active: current === 'dead',
				onClick: () => onSection('dead'),
			},
			{
				key: 'system',
				label: t('common:nav-staff-jobs-system'),
				icon: <IconSettingsAutomation />,
				count: overview.counts.systemJobs,
				active: current === 'system',
				onClick: () => onSection('system'),
			},
		],
	};

	const groups: ListPanelGroup[] = [sections];
	for (const filter of filters) {
		if (filter.panel === false) {
			continue;
		}
		groups.push({
			key: filter.key,
			title: filter.label,
			entries: filter.choices.map((choice) => ({
				key: `${filter.key}:${choice.value}`,
				label: choice.label,
				icon: choice.icon,
				count: filterCounts[filter.key]?.[choice.value] ?? null,
				active: filtersValue[filter.key]?.includes(choice.value) ?? false,
				onClick: () => onShortcut(filter.key, choice.value),
			})),
		});
	}

	return groups;
};

export const jobsSectionPath = (
	section: JobsSection,
): JobsSectionPaths[JobsSection] => SECTION_PATHS[section];
