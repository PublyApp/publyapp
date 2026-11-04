import {
	IconAlertTriangle,
	IconSettingsAutomation,
	IconStack2,
} from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import type { JobsOverview } from './_jobs-overview';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;

/** Shopkart's StatCard shell: 16px radius and a plain 1px ring, not the
 * shared chrome shadow (the owner rejected that shadow on these figures). */
const STAT_CARD_CLASS =
	'rounded-[16px] text-sm shadow-[0_0_0_1px_var(--border)]';

/**
 * The three StatCards shared by every job page (§4.8). Every figure is a
 * whole-collection count from `useJobsOverview` (issue #2301); « — » only when
 * the API has not answered yet.
 */
export const JobsStatCards = ({
	overview,
	t,
}: {
	overview: JobsOverview;
	t: Translate;
}) => {
	const queue = overview.queueCounts;
	const deadLetters = overview.deadLetterCounts;
	const systemJobs = overview.systemJobCounts;

	return (
		<>
			<StatCard
				testId="jobs-stat-queue"
				className={STAT_CARD_CLASS}
				label={t('staff-jobs:jobs-stat-queue')}
				icon={<IconStack2 />}
				value={queue ? (queue.total ?? 0) : <Dash />}
				footer={
					queue ? (
						<>
							{t('staff-jobs:jobs-stat-processing', {
								count: queue.processing ?? 0,
							})}{' '}
							·{' '}
							{t('staff-jobs:jobs-stat-retrying', {
								count: queue.retrying ?? 0,
							})}
						</>
					) : (
						<Dash />
					)
				}
			/>
			<StatCard
				testId="jobs-stat-dead"
				className={STAT_CARD_CLASS}
				label={t('staff-jobs:jobs-stat-dead')}
				icon={<IconAlertTriangle />}
				value={deadLetters ? (deadLetters.open ?? 0) : <Dash />}
				footer={
					deadLetters ? (
						// Red only when there is something to triage; a neutral
						// grey « 0 » is not an alarm.
						<span
							className={
								(deadLetters.recent ?? 0) > 0
									? 'text-[var(--publy-chip-suspended-text)]'
									: 'text-muted-foreground'
							}
						>
							{t('staff-jobs:jobs-stat-dead-window', {
								count: deadLetters.recent ?? 0,
							})}
						</span>
					) : (
						<Dash />
					)
				}
			/>
			<StatCard
				testId="jobs-stat-system"
				className={STAT_CARD_CLASS}
				label={t('staff-jobs:jobs-stat-system')}
				icon={<IconSettingsAutomation />}
				value={systemJobs ? (systemJobs.enabled ?? 0) : <Dash />}
				unit={systemJobs ? `/ ${systemJobs.total ?? 0}` : undefined}
				footer={
					systemJobs ? (
						<>
							{t('staff-jobs:jobs-stat-system-footer', {
								count: systemJobs.disabled ?? 0,
							})}
						</>
					) : (
						<Dash />
					)
				}
			/>
		</>
	);
};
