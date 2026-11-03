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
