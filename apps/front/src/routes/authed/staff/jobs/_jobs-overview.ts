import {
	toStaffDeadLetterRows,
	toStaffJobQueueRows,
	toStaffSystemJobDefinitionRows,
	useStaffDeadLettersQuery,
	useStaffJobQueueQuery,
	useStaffSystemJobDefinitionsQuery,
	type StaffDeadLetterRow,
	type StaffJobQueueRow,
	type StaffSystemJobDefinitionRow,
} from '~/lib/query/staff-jobs';

export type JobsOverview = {
	/** The complete collection, or `null` when the first page has a next cursor. */
	queue: StaffJobQueueRow[] | null;
	deadLetters: StaffDeadLetterRow[] | null;
	systemJobs: StaffSystemJobDefinitionRow[] | null;
	counts: {
		queue: number | null;
		deadLetters: number | null;
		systemJobs: number | null;
	};
};

const completeness = (
	data:
		| { data?: unknown[] | null; nextCursor?: string | null }
		| null
		| undefined,
): boolean => data != null && data.nextCursor == null;

/**
 * The whole-collection figures shared by the three job pages: the side panel's
 * section counts and the three StatCards. The list endpoints expose no count
 * endpoint (#2286 API gap), so a figure is shown only when the first page is
 * the whole collection (`nextCursor == null`); otherwise it is `null` and
 * renders « — ». Never a page-local sum presented as a total.
 */
export const useJobsOverview = (): JobsOverview => {
	const queueQuery = useStaffJobQueueQuery({
		sortId: 'created_at',
		sortOrder: 'desc',
		size: 100,
	});
	const deadLetterQuery = useStaffDeadLettersQuery({
		sortId: 'failed_at',
		sortOrder: 'desc',
		size: 100,
	});
	const systemJobQuery = useStaffSystemJobDefinitionsQuery({
		sortId: 'updated_at',
		sortOrder: 'desc',
		size: 100,
	});

	const queueComplete = completeness(queueQuery?.data);
	const deadLettersComplete = completeness(deadLetterQuery?.data);
	const systemJobsComplete = completeness(systemJobQuery?.data);

	return {
		queue: queueComplete ? toStaffJobQueueRows(queueQuery?.data?.data) : null,
		deadLetters: deadLettersComplete
			? toStaffDeadLetterRows(deadLetterQuery?.data?.data)
			: null,
		systemJobs: systemJobsComplete
			? toStaffSystemJobDefinitionRows(systemJobQuery?.data?.data)
			: null,
		counts: {
			queue: queueComplete ? (queueQuery?.data?.data?.length ?? 0) : null,
			deadLetters: deadLettersComplete
				? (deadLetterQuery?.data?.data?.length ?? 0)
				: null,
			systemJobs: systemJobsComplete
				? (systemJobQuery?.data?.data?.length ?? 0)
				: null,
		},
	};
};
