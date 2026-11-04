import {
	useStaffDeadLettersQuery,
	useStaffJobQueueQuery,
	useStaffSystemJobDefinitionsQuery,
} from '~/lib/query/staff-jobs';

import type {
	DeadLetterListCounts,
	JobQueueListCounts,
	SystemJobListCounts,
} from '@org/client-ts/models/index';

import { jobOf } from './_job-catalogue';

export type JobsOverview = {
	counts: {
		queue: number | null;
		deadLetters: number | null;
		systemJobs: number | null;
	};
	queueCounts: JobQueueListCounts | null;
	deadLetterCounts: DeadLetterListCounts | null;
	systemJobCounts: SystemJobListCounts | null;
};

/**
 * The whole-collection figures shared by the three job pages: the side panel's
 * section counts and the three StatCards, from each list's `totalCount` and
 * `counts` (issue #2301) — one row per list, never a 100-row page.
 */
export const useJobsOverview = (): JobsOverview => {
	const queueQuery = useStaffJobQueueQuery({ size: 1 });
	const deadLetterQuery = useStaffDeadLettersQuery({ size: 1 });
	const systemJobQuery = useStaffSystemJobDefinitionsQuery({ size: 1 });

	return {
		counts: {
			queue: queueQuery?.data?.totalCount ?? null,
			deadLetters: deadLetterQuery?.data?.totalCount ?? null,
			systemJobs: systemJobQuery?.data?.totalCount ?? null,
		},
		queueCounts: queueQuery?.data?.counts ?? null,
		deadLetterCounts: deadLetterQuery?.data?.counts ?? null,
		systemJobCounts: systemJobQuery?.data?.counts ?? null,
	};
};

/**
 * The « Familles » panel counters: the API returns one count per technical job
 * type (or key), and the family each one belongs to is classified here by the
 * job catalogue — the single source the row cells already use.
 */
/** The four panel families, always present: the API answered, so « 0 » is a
 * real count, not a missing value (the prototype prints 0 for an empty family). */
export type JobFamilyCounts = {
	publishing: number;
	email: number;
	accounts: number;
	maintenance: number;
};

export const buildJobFamilyCounts = (
	entries:
		| readonly { key: string | null | undefined; count: number | null }[]
		| null
		| undefined,
): JobFamilyCounts => {
	const counts: JobFamilyCounts = {
		publishing: 0,
		email: 0,
		accounts: 0,
		maintenance: 0,
	};
	for (const entry of entries ?? []) {
		const family = jobOf(entry.key).family;
		counts[family] += entry.count ?? 0;
	}
	return counts;
};
