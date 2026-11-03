import {
	IconAlertTriangle,
	IconSettingsAutomation,
	IconStack2,
} from '@tabler/icons-react';
import { StatCard } from '~/components/ui/stat-card';

import { deadLetterState } from './_job-catalogue';
import type { JobsOverview } from './_jobs-overview';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const Dash = () => <span className="text-muted-foreground">—</span>;

/** Shopkart's StatCard shell: 16px radius and a plain 1px ring, not the
 * shared chrome shadow (the owner rejected that shadow on these figures). */
const STAT_CARD_CLASS =
	'rounded-[16px] text-sm shadow-[0_0_0_1px_var(--border)]';

const sevenDaysAgo = (): number => Date.now() - 7 * 86_400_000;

/**
 * The three StatCards shared by every job page (§4.8). Every figure is a
 * whole-collection count from `useJobsOverview`; when a list's first page is
 * not the whole collection the card shows « — », never the loaded page's sum.
 */
export const JobsStatCards = ({
	overview,
	t,
}: {
	overview: JobsOverview;
	t: Translate;
}) => {
	const queue = overview.queue;
	let processing = 0;
	let retrying = 0;
	if (queue) {
		for (const row of queue) {
			if (row.status === 'processing') {
				processing += 1;
			}
			if ((row.attempts ?? 0) > 0) {
				retrying += 1;
			}
		}
	}

	const deadLetters = overview.deadLetters;
	let open = 0;
	let recent = 0;
	if (deadLetters) {
		const cutoff = sevenDaysAgo();
		for (const row of deadLetters) {
			if (deadLetterState(row) === 'open') {
				open += 1;
			}
			if (row.failedAt && row.failedAt.getTime() >= cutoff) {
				recent += 1;
			}
		}
	}

	const systemJobs = overview.systemJobs;
	let enabled = 0;
	if (systemJobs) {
		for (const row of systemJobs) {
			if (row.isEnabled) {
				enabled += 1;
			}
		}
	}

	return (
		<>
			<StatCard
				testId="jobs-stat-queue"
				className={STAT_CARD_CLASS}
				label={t('staff-jobs:jobs-stat-queue')}
				icon={<IconStack2 />}
				value={queue ? queue.length : <Dash />}
				footer={
					queue ? (
						<>
							{t('staff-jobs:jobs-stat-processing', { count: processing })} ·{' '}
							{t('staff-jobs:jobs-stat-retrying', { count: retrying })}
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
				value={deadLetters ? open : <Dash />}
				footer={
					deadLetters ? (
						<span className="text-[var(--publy-chip-suspended-text)]">
							{t('staff-jobs:jobs-stat-dead-window', { count: recent })}
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
				value={systemJobs ? enabled : <Dash />}
				unit={systemJobs ? `/ ${systemJobs.length}` : undefined}
				footer={
					systemJobs ? (
						<>
							{t('staff-jobs:jobs-stat-system-footer', {
								count: systemJobs.length - enabled,
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
