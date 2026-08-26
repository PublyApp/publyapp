import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: mocks.getOrCreateStaffClient,
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
	buildFindStaffDeadLettersQueryParameters,
	buildFindStaffJobQueueQueryParameters,
	buildFindStaffSystemJobDefinitionsQueryParameters,
	invalidateStaffJobsQueries,
	requeueDeadLetterMutationOptions,
	staffDeadLetterDetailsQueryOptions,
	staffDeadLettersQueryOptions,
	staffJobQueueDetailsQueryOptions,
	staffJobQueueQueryOptions,
	staffSystemJobDefinitionDetailsQueryOptions,
	staffSystemJobDefinitionsQueryOptions,
	STAFF_DEAD_LETTERS_QUERY_KEY,
	STAFF_JOB_QUEUE_QUERY_KEY,
	STAFF_JOBS_QUERY_KEY,
	STAFF_SYSTEM_JOBS_QUERY_KEY,
	toStaffDeadLetterRows,
	toStaffJobQueueRows,
	toStaffSystemJobDefinitionRows,
	triggerSystemJobMutationOptions,
	updateSystemJobCronMutationOptions,
	updateSystemJobEnabledMutationOptions,
} from '~/lib/query/staff-jobs';

import type {
	DeadLetterListItem,
	FindDeadLettersResponse,
	FindJobQueueItemsResponse,
	FindSystemJobDefinitionsResponse,
	JobQueueListItem,
	SystemJobDefinitionListItem,
} from '@org/client-ts/models/index';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('buildFindStaffJobQueueQueryParameters', () => {
	test('trims values and stringifies page size', () => {
		expect(
			buildFindStaffJobQueueQueryParameters({
				status: ' pending ',
				jobType: ' email.send ',
				tenantId: ' tenant-1 ',
				sortId: ' created_at ',
				sortOrder: 'desc',
				cursor: ' cursor-123 ',
				size: 50,
			}),
		).toEqual({
			status: 'pending',
			jobType: 'email.send',
			tenantId: 'tenant-1',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'cursor-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffJobQueueQueryParameters({
				status: '   ',
				jobType: '',
				tenantId: undefined,
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('buildFindStaffDeadLettersQueryParameters', () => {
	test('maps external state status filter alongside the shared filters', () => {
		expect(
			buildFindStaffDeadLettersQueryParameters({
				externalStateStatus: '6',
				jobType: 'post.publish',
				size: 25,
			}),
		).toEqual({
			externalStateStatus: '6',
			jobType: 'post.publish',
			limit: '25',
		});
	});
});

describe('buildFindStaffSystemJobDefinitionsQueryParameters', () => {
	test('passes the enabled filter and pagination through', () => {
		expect(
			buildFindStaffSystemJobDefinitionsQueryParameters({
				isEnabled: 'true',
				size: 100,
			}),
		).toEqual({ isEnabled: 'true', limit: '100' });
	});
});

describe('list fetchers', () => {
	test('queue list calls the generated builder with normalized parameters', async () => {
		const get = vi.fn().mockResolvedValue({
			data: [],
			nextCursor: undefined,
		} as FindJobQueueItemsResponse);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { queue: { get } } },
		});

		const result = await staffJobQueueQueryOptions.fetcher({
			status: 'pending',
			size: 50,
		});

		expect(get).toHaveBeenCalledWith({
			queryParameters: { status: 'pending', limit: '50' },
		});
		expect(result).toEqual({ data: [], nextCursor: undefined });
	});

	test('dead-letter list calls the generated builder', async () => {
		const get = vi.fn().mockResolvedValue({
			data: [],
			nextCursor: undefined,
		} as FindDeadLettersResponse);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { deadLetter: { get } } },
		});

		await staffDeadLettersQueryOptions.fetcher({ cursor: 'cursor-9' });

		expect(get).toHaveBeenCalledWith({
			queryParameters: { cursor: 'cursor-9' },
		});
	});

	test('system-jobs list calls the generated builder', async () => {
		const get = vi.fn().mockResolvedValue({
			data: [],
			nextCursor: undefined,
		} as FindSystemJobDefinitionsResponse);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { systemJobs: { get } } },
		});

		await staffSystemJobDefinitionsQueryOptions.fetcher({});

		expect(get).toHaveBeenCalledWith({ queryParameters: {} });
	});
});

describe('detail fetchers', () => {
	test('queue item calls the generated item builder for the row id', async () => {
		const get = vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending' });
		const byQueueItemId = vi.fn().mockReturnValue({ get });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { queue: { byQueueItemId } } },
		});

		const result = await staffJobQueueDetailsQueryOptions.fetcher({
			queueItemId: 'job-1',
		});

		expect(byQueueItemId).toHaveBeenCalledWith('job-1');
		expect(result).toEqual({ id: 'job-1', status: 'pending' });
	});

	test('dead-letter detail unwraps the envelope detail', async () => {
		const detail = { id: 'dl-1', payload: '{"x":1}' };
		const get = vi.fn().mockResolvedValue({ detail });
		const byDeadLetterId = vi.fn().mockReturnValue({ get });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { deadLetter: { byDeadLetterId } } },
		});

		const result = await staffDeadLetterDetailsQueryOptions.fetcher({
			deadLetterId: 'dl-1',
		});

		expect(byDeadLetterId).toHaveBeenCalledWith('dl-1');
		expect(result).toEqual(detail);
	});

	test('system-job detail calls the generated item builder', async () => {
		const get = vi
			.fn()
			.mockResolvedValue({ id: 'sj-1', jobKey: 'email.retention' });
		const bySystemJobId = vi.fn().mockReturnValue({ get });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { systemJobs: { bySystemJobId } } },
		});

		const result = await staffSystemJobDefinitionDetailsQueryOptions.fetcher({
			systemJobId: 'sj-1',
		});

		expect(bySystemJobId).toHaveBeenCalledWith('sj-1');
		expect(result).toEqual({ id: 'sj-1', jobKey: 'email.retention' });
	});
});

describe('mutations', () => {
	test('requeue posts the optional note as an untyped string body', async () => {
		const post = vi.fn().mockResolvedValue({ jobId: 'job-8' });
		const requeue = { post };
		const byDeadLetterId = vi.fn().mockReturnValue({ requeue });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { deadLetter: { byDeadLetterId } },
		});

		const result = await requeueDeadLetterMutationOptions.mutationFn({
			deadLetterId: 'dl-1',
			note: ' retry after fix ',
		});

		expect(byDeadLetterId).toHaveBeenCalledWith('dl-1');
		expect(post).toHaveBeenCalledTimes(1);
		const body = post.mock.calls[0]?.[0] as { note?: unknown };
		expect(body).toHaveProperty('note');
		expect(result).toEqual({ jobId: 'job-8' });
	});

	test('requeue without a note sends an empty body', async () => {
		const post = vi.fn().mockResolvedValue({ jobId: 'job-8' });
		const requeue = { post };
		const byDeadLetterId = vi.fn().mockReturnValue({ requeue });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { deadLetter: { byDeadLetterId } },
		});

		await requeueDeadLetterMutationOptions.mutationFn({
			deadLetterId: 'dl-1',
			note: '   ',
		});

		expect(post).toHaveBeenCalledWith({});
	});

	test('enabled toggle patches an untyped boolean body', async () => {
		const patch = vi.fn().mockResolvedValue({ id: 'sj-1', isEnabled: false });
		const enabled = { patch };
		const bySystemJobId = vi.fn().mockReturnValue({ enabled });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { systemJobs: { bySystemJobId } } },
		});

		const result = await updateSystemJobEnabledMutationOptions.mutationFn({
			systemJobId: 'sj-1',
			isEnabled: false,
		});

		expect(bySystemJobId).toHaveBeenCalledWith('sj-1');
		expect(patch).toHaveBeenCalledTimes(1);
		const body = patch.mock.calls[0]?.[0] as { isEnabled?: unknown };
		expect(body).toHaveProperty('isEnabled');
		expect(result).toEqual({ id: 'sj-1', isEnabled: false });
	});

	test('cron update patches a trimmed untyped string body', async () => {
		const patch = vi.fn().mockResolvedValue({ id: 'sj-1' });
		const cron = { patch };
		const bySystemJobId = vi.fn().mockReturnValue({ cron });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { systemJobs: { bySystemJobId } } },
		});

		await updateSystemJobCronMutationOptions.mutationFn({
			systemJobId: 'sj-1',
			cronExpression: ' 0 3 * * * ',
		});

		expect(patch).toHaveBeenCalledTimes(1);
		const body = patch.mock.calls[0]?.[0] as {
			cronExpression?: unknown;
		};
		expect(body).toHaveProperty('cronExpression');
	});

	test('trigger-now posts without a body', async () => {
		const post = vi.fn().mockResolvedValue({ jobId: 'job-9' });
		const trigger = { post };
		const bySystemJobId = vi.fn().mockReturnValue({ trigger });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { jobs: { systemJobs: { bySystemJobId } } },
		});

		await triggerSystemJobMutationOptions.mutationFn({
			systemJobId: 'sj-1',
		});

		expect(bySystemJobId).toHaveBeenCalledWith('sj-1');
		expect(post).toHaveBeenCalledWith();
	});
});

describe('query keys', () => {
	test('prefixes every list key with the staff scope and one stable jobs scope', () => {
		expect(staffJobQueueQueryOptions.queryKey({})).toEqual([
			'staff',
			...STAFF_JOB_QUEUE_QUERY_KEY,
		]);
		expect(STAFF_JOBS_QUERY_KEY).toEqual(['staff-jobs']);
		expect(STAFF_JOB_QUEUE_QUERY_KEY).toEqual(['staff-jobs', 'queue']);
		expect(STAFF_DEAD_LETTERS_QUERY_KEY).toEqual(['staff-jobs', 'dead-letter']);
		expect(STAFF_SYSTEM_JOBS_QUERY_KEY).toEqual(['staff-jobs', 'system-jobs']);
	});

	test('changes when the filter changes, so switching filters never serves stale cached rows', () => {
		const noFilter = staffJobQueueQueryOptions.queryKey({});
		const filtered = staffJobQueueQueryOptions.queryKey({
			status: 'pending',
		});

		expect(filtered).not.toEqual(noFilter);
		expect(filtered).toEqual([
			'staff',
			...STAFF_JOB_QUEUE_QUERY_KEY,
			{ status: 'pending' },
		]);
	});

	test('invalidation helper scopes to the whole staff-jobs subtree', () => {
		const invalidateQueries = vi.fn();
		void invalidateStaffJobsQueries({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', 'staff-jobs'],
		});
	});
});

describe('row mappers', () => {
	test('toStaffJobQueueRows normalizes items and skips rows without usable ids', () => {
		const createdAt = new Date('2026-08-01T10:00:00Z');

		const rows = toStaffJobQueueRows([
			{
				id: 'job-1',
				jobType: ' email.send ',
				status: 'pending',
				priority: 5,
				attempts: 0,
				maxAttempts: 3,
				tenantId: 'tenant-1',
				createdAt,
			} as JobQueueListItem,
			{ id: '', jobType: 'skip.me' } as JobQueueListItem,
		]);

		expect(rows).toEqual([
			{
				id: 'job-1',
				jobType: 'email.send',
				status: 'pending',
				priority: 5,
				attempts: 0,
				maxAttempts: 3,
				nextAttemptAt: null,
				lockedBy: null,
				lockedUntil: null,
				lastError: null,
				tenantId: 'tenant-1',
				createdAt,
				updatedAt: null,
			},
		]);
	});

	test('toStaffDeadLetterRows normalizes items and skips rows without usable ids', () => {
		const failedAt = new Date('2026-08-02T09:30:00Z');

		const rows = toStaffDeadLetterRows([
			{
				id: 'dl-1',
				originalJobId: 'job-0',
				jobType: 'post.publish',
				attempts: 3,
				externalStateStatus: 6,
				failedAt,
				tenantId: 'tenant-1',
			} as DeadLetterListItem,
			{ id: null } as DeadLetterListItem,
		]);

		expect(rows).toEqual([
			{
				id: 'dl-1',
				originalJobId: 'job-0',
				jobType: 'post.publish',
				attempts: 3,
				lastError: null,
				externalStateStatus: 6,
				triagedAt: null,
				failedAt,
				requeuedAsJobId: null,
				requeuedAt: null,
				tenantId: 'tenant-1',
			},
		]);
	});

	test('toStaffSystemJobDefinitionRows normalizes items and skips rows without usable ids', () => {
		const lastEnqueuedAt = new Date('2026-08-03T03:00:00Z');

		const rows = toStaffSystemJobDefinitionRows([
			{
				id: 'sj-1',
				jobKey: 'email-prepared-sends-retention',
				cronExpression: '0 * * * *',
				isEnabled: true,
				lastEnqueuedAt,
			} as SystemJobDefinitionListItem,
			{} as SystemJobDefinitionListItem,
		]);

		expect(rows).toEqual([
			{
				id: 'sj-1',
				jobKey: 'email-prepared-sends-retention',
				cronExpression: '0 * * * *',
				isEnabled: true,
				lastEnqueuedAt,
				updatedAt: null,
			},
		]);
	});

	test('row mappers tolerate a null list', () => {
		expect(toStaffJobQueueRows(null)).toEqual([]);
		expect(toStaffDeadLetterRows(undefined)).toEqual([]);
		expect(toStaffSystemJobDefinitionRows(null)).toEqual([]);
	});
});
