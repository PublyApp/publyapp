import {
	createUntypedBoolean,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	DeadLetterDetail,
	DeadLetterListItem,
	FindDeadLettersResponse,
	FindJobQueueItemsResponse,
	FindSystemJobDefinitionsResponse,
	JobQueueItemDetail,
	JobQueueListItem,
	RequeueDeadLetterForStaffBody,
	SystemJobDefinitionDetail,
	SystemJobDefinitionListItem,
	UpdateSystemJobDefinitionCronForStaffBody,
	UpdateSystemJobDefinitionEnabledForStaffBody,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

/**
 * Query seam for the A5 staff jobs dashboard (#636): the job-queue list, the
 * dead-letter list/detail/requeue, and the system-job definitions with their
 * enable / cron / trigger-now mutations.
 */

export type StaffJobQueueQueryVariables = {
	status?: string;
	jobType?: string;
	tenantId?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffDeadLettersQueryVariables = {
	externalStateStatus?: string;
	jobType?: string;
	tenantId?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffSystemJobDefinitionsQueryVariables = {
	isEnabled?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffJobQueueDetailsQueryVariables = {
	queueItemId: string;
};

export type StaffDeadLetterDetailsQueryVariables = {
	deadLetterId: string;
};

export type StaffSystemJobDefinitionDetailsQueryVariables = {
	systemJobId: string;
};

export type StaffRequeueDeadLetterInput = {
	deadLetterId: string;
	note?: string | null;
};

export type StaffUpdateSystemJobEnabledInput = {
	systemJobId: string;
	isEnabled: boolean;
};

export type StaffUpdateSystemJobCronInput = {
	systemJobId: string;
	cronExpression: string;
};

export type StaffTriggerSystemJobInput = {
	systemJobId: string;
};

export type StaffJobQueueRow = {
	id: string;
	jobType: string | null;
	status: string | null;
	priority: number | null;
	attempts: number | null;
	maxAttempts: number | null;
	nextAttemptAt: Date | null;
	lockedBy: string | null;
	lockedUntil: Date | null;
	lastError: string | null;
	tenantId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
};

export type StaffDeadLetterRow = {
	id: string;
	originalJobId: string | null;
	jobType: string | null;
	attempts: number | null;
	lastError: string | null;
	externalStateStatus: number | null;
	triagedAt: Date | null;
	failedAt: Date | null;
	requeuedAsJobId: string | null;
	requeuedAt: Date | null;
	tenantId: string | null;
};

export type StaffSystemJobDefinitionRow = {
	id: string;
	jobKey: string | null;
	cronExpression: string | null;
	isEnabled: boolean | null;
	lastEnqueuedAt: Date | null;
	updatedAt: Date | null;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation/removal key from this. */
export const STAFF_JOBS_QUERY_KEY = ['staff-jobs'] as const;
export const STAFF_JOB_QUEUE_QUERY_KEY = [...STAFF_JOBS_QUERY_KEY, 'queue'];
export const STAFF_DEAD_LETTERS_QUERY_KEY = [
	...STAFF_JOBS_QUERY_KEY,
	'dead-letter',
];
export const STAFF_SYSTEM_JOBS_QUERY_KEY = [
	...STAFF_JOBS_QUERY_KEY,
	'system-jobs',
];

const STAFF_JOB_QUEUE_DETAILS_QUERY_KEY = [
	...STAFF_JOB_QUEUE_QUERY_KEY,
	'detail',
] as const;
const STAFF_DEAD_LETTER_DETAILS_QUERY_KEY = [
	...STAFF_DEAD_LETTERS_QUERY_KEY,
	'detail',
] as const;
const STAFF_SYSTEM_JOB_DEFINITION_DETAILS_QUERY_KEY = [
	...STAFF_SYSTEM_JOBS_QUERY_KEY,
	'detail',
] as const;

/** Invalidates every staff-jobs query (lists + details) after any mutation. */
export const invalidateStaffJobsQueries = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_JOBS_QUERY_KEY),
	});

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => normalizeString(value) ?? null;

const normalizeNullableDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const normalizeLimit = (size: number | undefined): string | undefined =>
	isPositiveSafeInteger(size) ? String(size) : undefined;

type StaffJobQueueQueryParameters = {
	status?: string;
	jobType?: string;
	tenantId?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
};

export const buildFindStaffJobQueueQueryParameters = (
	variables: StaffJobQueueQueryVariables,
): StaffJobQueueQueryParameters => ({
	status: normalizeString(variables.status),
	jobType: normalizeString(variables.jobType),
	tenantId: normalizeString(variables.tenantId),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: normalizeLimit(variables.size),
});

type StaffDeadLettersQueryParameters = {
	externalStateStatus?: string;
	jobType?: string;
	tenantId?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
};

export const buildFindStaffDeadLettersQueryParameters = (
	variables: StaffDeadLettersQueryVariables,
): StaffDeadLettersQueryParameters => ({
	externalStateStatus: normalizeString(variables.externalStateStatus),
	jobType: normalizeString(variables.jobType),
	tenantId: normalizeString(variables.tenantId),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: normalizeLimit(variables.size),
});

type StaffSystemJobDefinitionsQueryParameters = {
	isEnabled?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
};

export const buildFindStaffSystemJobDefinitionsQueryParameters = (
	variables: StaffSystemJobDefinitionsQueryVariables,
): StaffSystemJobDefinitionsQueryParameters => ({
	isEnabled: normalizeString(variables.isEnabled),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: normalizeLimit(variables.size),
});

const requireListResult = <T>(result: T | undefined, what: string): T => {
	if (!result) {
		throw new Error(`${what} result was empty`);
	}

	return result;
};

export const staffJobQueueQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindJobQueueItemsResponse,
	StaffJobQueueQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_JOB_QUEUE_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.jobs.queue.get({
				queryParameters: buildFindStaffJobQueueQueryParameters(variables),
			});

			return requireListResult(result, 'staff job queue');
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffJobQueueDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	JobQueueItemDetail,
	StaffJobQueueDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_JOB_QUEUE_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.jobs.queue
				.byQueueItemId(variables.queueItemId)
				.get();

			if (!result) {
				throw new Error('staff job queue item result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffDeadLettersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindDeadLettersResponse,
	StaffDeadLettersQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_DEAD_LETTERS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.jobs.deadLetter.get({
				queryParameters: buildFindStaffDeadLettersQueryParameters(variables),
			});

			return requireListResult(result, 'staff dead letters');
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffDeadLetterDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	DeadLetterDetail,
	StaffDeadLetterDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_DEAD_LETTER_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const response = await client.staff.jobs.deadLetter
				.byDeadLetterId(variables.deadLetterId)
				.get();

			if (!response?.detail) {
				throw new Error('staff dead letter result was empty');
			}

			return response.detail;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffSystemJobDefinitionsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindSystemJobDefinitionsResponse,
	StaffSystemJobDefinitionsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_SYSTEM_JOBS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.jobs.systemJobs.get({
				queryParameters:
					buildFindStaffSystemJobDefinitionsQueryParameters(variables),
			});

			return requireListResult(result, 'staff system job definitions');
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffSystemJobDefinitionDetailsQueryOptions =
	buildStaffQueryOptions<
		ApiClient,
		SystemJobDefinitionDetail,
		StaffSystemJobDefinitionDetailsQueryVariables
	>(
		{
			queryKeyFn: () => [...STAFF_SYSTEM_JOB_DEFINITION_DETAILS_QUERY_KEY],
			fetcher: async (client, variables) => {
				const result = await client.staff.jobs.systemJobs
					.bySystemJobId(variables.systemJobId)
					.get();

				if (!result) {
					throw new Error('staff system job definition result was empty');
				}

				return result;
			},
		},
		{ clientAccessor: getClientManager() },
	);

export const requeueDeadLetterMutationOptions = buildStaffMutationOptions<
	ApiClient,
	{ jobId?: string | null } | undefined,
	StaffRequeueDeadLetterInput
>(
	{
		mutationKeyFn: () => [...STAFF_DEAD_LETTERS_QUERY_KEY, 'requeue'],
		mutationFn: (client, variables) => {
			const note = normalizeString(variables.note ?? undefined);

			const body: RequeueDeadLetterForStaffBody = {};
			if (note !== undefined) {
				body.note = createUntypedString(note) as typeof body.note;
			}

			return client.staff.deadLetter
				.byDeadLetterId(variables.deadLetterId)
				.requeue.post(body);
		},
		meta: {
			successMessage: 'dead-letter-requeue-success',
		},
	},
	{ clientAccessor: getClientManager() },
);

export const updateSystemJobEnabledMutationOptions = buildStaffMutationOptions<
	ApiClient,
	SystemJobDefinitionDetail | undefined,
	StaffUpdateSystemJobEnabledInput
>(
	{
		mutationKeyFn: () => [...STAFF_SYSTEM_JOBS_QUERY_KEY, 'enabled'],
		mutationFn: (client, variables) => {
			const body: UpdateSystemJobDefinitionEnabledForStaffBody = {};
			body.isEnabled = createUntypedBoolean(
				variables.isEnabled,
			) as typeof body.isEnabled;

			return client.staff.jobs.systemJobs
				.bySystemJobId(variables.systemJobId)
				.enabled.patch(body);
		},
		meta: {
			silentSuccess: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const updateSystemJobCronMutationOptions = buildStaffMutationOptions<
	ApiClient,
	SystemJobDefinitionDetail | undefined,
	StaffUpdateSystemJobCronInput
>(
	{
		mutationKeyFn: () => [...STAFF_SYSTEM_JOBS_QUERY_KEY, 'cron'],
		mutationFn: (client, variables) => {
			const cronExpression = normalizeString(variables.cronExpression);
			if (!cronExpression) {
				throw new Error('cron expression is required');
			}

			const body: UpdateSystemJobDefinitionCronForStaffBody = {};
			body.cronExpression = createUntypedString(
				cronExpression,
			) as typeof body.cronExpression;

			return client.staff.jobs.systemJobs
				.bySystemJobId(variables.systemJobId)
				.cron.patch(body);
		},
		meta: {
			silentSuccess: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const triggerSystemJobMutationOptions = buildStaffMutationOptions<
	ApiClient,
	{ jobId?: string | null; scheduledFireAt?: Date | null } | undefined,
	StaffTriggerSystemJobInput
>(
	{
		mutationKeyFn: () => [...STAFF_SYSTEM_JOBS_QUERY_KEY, 'trigger'],
		mutationFn: (client, variables) =>
			client.staff.jobs.systemJobs
				.bySystemJobId(variables.systemJobId)
				.trigger.post(),
		meta: {
			successMessage: 'system-job-trigger-success',
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffJobQueueQuery = (variables: StaffJobQueueQueryVariables) =>
	useQuery({
		queryKey: staffJobQueueQueryOptions.queryKey(variables),
		queryFn: () => staffJobQueueQueryOptions.fetcher(variables),
	});

export const useStaffDeadLettersQuery = (
	variables: StaffDeadLettersQueryVariables,
) =>
	useQuery({
		queryKey: staffDeadLettersQueryOptions.queryKey(variables),
		queryFn: () => staffDeadLettersQueryOptions.fetcher(variables),
	});

export const useStaffSystemJobDefinitionsQuery = (
	variables: StaffSystemJobDefinitionsQueryVariables,
) =>
	useQuery({
		queryKey: staffSystemJobDefinitionsQueryOptions.queryKey(variables),
		queryFn: () => staffSystemJobDefinitionsQueryOptions.fetcher(variables),
	});

export const useStaffRequeueDeadLetterMutation = () =>
	useMutation(requeueDeadLetterMutationOptions);

export const useStaffUpdateSystemJobEnabledMutation = () =>
	useMutation(updateSystemJobEnabledMutationOptions);

export const useStaffUpdateSystemJobCronMutation = () =>
	useMutation(updateSystemJobCronMutationOptions);

export const useStaffTriggerSystemJobMutation = () =>
	useMutation(triggerSystemJobMutationOptions);

export const toStaffJobQueueRows = (
	items: JobQueueListItem[] | null | undefined,
): StaffJobQueueRow[] => {
	const rows: StaffJobQueueRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeNullableString(item.id);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			jobType: normalizeNullableString(item.jobType),
			status: normalizeNullableString(item.status),
			priority: item.priority ?? null,
			attempts: item.attempts ?? null,
			maxAttempts: item.maxAttempts ?? null,
			nextAttemptAt: normalizeNullableDate(item.nextAttemptAt),
			lockedBy: normalizeNullableString(item.lockedBy),
			lockedUntil: normalizeNullableDate(item.lockedUntil),
			lastError: normalizeNullableString(item.lastError),
			tenantId: normalizeNullableString(item.tenantId),
			createdAt: normalizeNullableDate(item.createdAt),
			updatedAt: normalizeNullableDate(item.updatedAt),
		});
	}

	return rows;
};

export const toStaffDeadLetterRows = (
	items: DeadLetterListItem[] | null | undefined,
): StaffDeadLetterRow[] => {
	const rows: StaffDeadLetterRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeNullableString(item.id);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			originalJobId: normalizeNullableString(item.originalJobId),
			jobType: normalizeNullableString(item.jobType),
			attempts: item.attempts ?? null,
			lastError: normalizeNullableString(item.lastError),
			externalStateStatus: item.externalStateStatus ?? null,
			triagedAt: normalizeNullableDate(item.triagedAt),
			failedAt: normalizeNullableDate(item.failedAt),
			requeuedAsJobId: normalizeNullableString(item.requeuedAsJobId),
			requeuedAt: normalizeNullableDate(item.requeuedAt),
			tenantId: normalizeNullableString(item.tenantId),
		});
	}

	return rows;
};

export const toStaffSystemJobDefinitionRows = (
	items: SystemJobDefinitionListItem[] | null | undefined,
): StaffSystemJobDefinitionRow[] => {
	const rows: StaffSystemJobDefinitionRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeNullableString(item.id);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			jobKey: normalizeNullableString(item.jobKey),
			cronExpression: normalizeNullableString(item.cronExpression),
			isEnabled: item.isEnabled ?? null,
			lastEnqueuedAt: normalizeNullableDate(item.lastEnqueuedAt),
			updatedAt: normalizeNullableDate(item.updatedAt),
		});
	}

	return rows;
};
