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
	buildFindStaffAuditLogsQueryParameters,
	exportStaffAuditLogsMutationOptions,
	staffAuditLogActionsQueryOptions,
	staffAuditLogDetailsQueryOptions,
	staffAuditLogsQueryOptions,
	STAFF_AUDIT_LOG_DETAILS_QUERY_KEY,
	STAFF_AUDIT_LOGS_QUERY_KEY,
	toStaffAuditLogRows,
} from '~/lib/query/staff-audit-logs';

import type {
	AuditLogDetail,
	AuditLogListItem,
	FindAuditLogsResponse,
	GetAuditLogActionsResponse,
} from '@org/client-ts/models/index';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('buildFindStaffAuditLogsQueryParameters', () => {
	test('trims values, joins action filters as CSV, and stringifies page size', () => {
		expect(
			buildFindStaffAuditLogsQueryParameters({
				actions: [' user.created ', 'tenant.updated', ''],
				startDate: ' 2026-01-01 ',
				endDate: ' 2026-01-31 ',
				sortId: ' created_at ',
				sortOrder: 'desc',
				cursor: ' cursor-123 ',
				size: 50,
			}),
		).toEqual({
			actions: 'user.created,tenant.updated',
			startDate: '2026-01-01',
			endDate: '2026-01-31T23:59:59',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'cursor-123',
			limit: '50',
		});
	});

	test('sends a bare end date at end-of-day so the API keeps the full end day', () => {
		expect(
			buildFindStaffAuditLogsQueryParameters({ endDate: '2026-01-31' }),
		).toEqual({ endDate: '2026-01-31T23:59:59' });
	});

	test('passes an already-qualified end timestamp through unchanged', () => {
		expect(
			buildFindStaffAuditLogsQueryParameters({
				endDate: '2026-01-31T15:00:00Z',
			}),
		).toEqual({ endDate: '2026-01-31T15:00:00Z' });
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffAuditLogsQueryParameters({
				actions: [],
				startDate: '   ',
				endDate: '',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('staffAuditLogsQueryOptions.fetcher', () => {
	test('calls the generated list builder with the normalized query parameters', async () => {
		const get = vi.fn().mockResolvedValue({
			data: [],
			nextCursor: undefined,
		} as FindAuditLogsResponse);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { auditLogs: { get } },
		});

		const result = await staffAuditLogsQueryOptions.fetcher({
			actions: ['user.created', 'tenant.updated'],
			startDate: '2026-01-01',
			endDate: '2026-01-31',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'cursor-123',
			size: 50,
		});

		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith({
			queryParameters: {
				actions: 'user.created,tenant.updated',
				startDate: '2026-01-01',
				endDate: '2026-01-31T23:59:59',
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: 'cursor-123',
				limit: '50',
			},
		});
		expect(result).toEqual({ data: [], nextCursor: undefined });
	});

	test('strips empty filter values from the request', async () => {
		const get = vi.fn().mockResolvedValue({
			data: [],
			nextCursor: undefined,
		} as FindAuditLogsResponse);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { auditLogs: { get } },
		});

		await staffAuditLogsQueryOptions.fetcher({});

		expect(get).toHaveBeenCalledWith({ queryParameters: {} });
	});
});

describe('staffAuditLogDetailsQueryOptions.fetcher', () => {
	test('calls the generated item builder for the log id', async () => {
		const get = vi.fn().mockResolvedValue({ id: 'log-1' } as AuditLogDetail);
		const byLogId = vi.fn().mockReturnValue({ get });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { auditLogs: { byLogId } },
		});

		const result = await staffAuditLogDetailsQueryOptions.fetcher({
			logId: 'log-1',
		});

		expect(byLogId).toHaveBeenCalledTimes(1);
		expect(byLogId).toHaveBeenCalledWith('log-1');
		expect(get).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ id: 'log-1' });
	});
});

describe('staffAuditLogActionsQueryOptions.fetcher', () => {
	test('calls the generated actions builder', async () => {
		const get = vi.fn().mockResolvedValue({
			actions: ['user.created'],
		} as GetAuditLogActionsResponse);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { auditLogs: { actions: { get } } },
		});

		const result = await staffAuditLogActionsQueryOptions.fetcher({});

		expect(get).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ actions: ['user.created'] });
	});
});

describe('exportStaffAuditLogsMutationOptions.mutationFn', () => {
	test('calls the export builder with the current filters and an end-of-day end date', async () => {
		const get = vi.fn().mockResolvedValue(new ArrayBuffer(8));
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { auditLogs: { exportEscaped: { get } } },
		});

		const result = await exportStaffAuditLogsMutationOptions.mutationFn({
			format: 'csv',
			actions: ['user.created', 'tenant.updated'],
			startDate: '2026-01-01',
			endDate: '2026-01-31',
		});

		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith({
			queryParameters: {
				format: 'csv',
				actions: 'user.created,tenant.updated',
				startDate: '2026-01-01',
				endDate: '2026-01-31T23:59:59',
			},
		});
		expect(result).toBeInstanceOf(ArrayBuffer);
	});

	test('omits empty filters from the export query parameters', async () => {
		const get = vi.fn().mockResolvedValue(new ArrayBuffer(8));
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { auditLogs: { exportEscaped: { get } } },
		});

		await exportStaffAuditLogsMutationOptions.mutationFn({
			format: 'json',
		});

		expect(get).toHaveBeenCalledWith({
			queryParameters: { format: 'json' },
		});
	});
});

describe('query keys', () => {
	test('prefixes list keys with the staff scope and a stable audit-logs scope', () => {
		expect(staffAuditLogsQueryOptions.queryKey({})).toEqual([
			'staff',
			...STAFF_AUDIT_LOGS_QUERY_KEY,
		]);
		expect(STAFF_AUDIT_LOG_DETAILS_QUERY_KEY).toEqual([
			'staff-audit-logs',
			'detail',
		]);
	});

	test('changes when the date filter changes, so switching dates never serves stale cached rows', () => {
		const noFilter = staffAuditLogsQueryOptions.queryKey({});
		const filtered = staffAuditLogsQueryOptions.queryKey({
			startDate: '2026-01-01',
			endDate: '2026-01-31',
		});

		expect(filtered).not.toEqual(noFilter);
		expect(filtered).toEqual([
			'staff',
			...STAFF_AUDIT_LOGS_QUERY_KEY,
			{ endDate: '2026-01-31', startDate: '2026-01-01' },
		]);
	});
});

describe('toStaffAuditLogRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const createdAt = new Date('2026-07-02T08:30:00Z');

		const rows = toStaffAuditLogRows([
			{
				id: 'log-1',
				userId: 'user-1',
				userName: ' Ada Lovelace ',
				userEmail: ' ada@example.com ',
				action: ' tenant.updated ',
				targetId: 'tenant-1',
				ipAddress: ' 10.0.0.1 ',
				createdAt,
			} as AuditLogListItem,
			{
				id: '',
				userId: 'user-2',
				userName: 'Skip',
				userEmail: 'skip@example.com',
				action: 'user.created',
			} as AuditLogListItem,
		]);

		expect(rows).toEqual([
			{
				id: 'log-1',
				action: 'tenant.updated',
				userName: 'Ada Lovelace',
				userEmail: 'ada@example.com',
				ipAddress: '10.0.0.1',
				targetId: 'tenant-1',
				createdAt,
			},
		]);
	});
});
