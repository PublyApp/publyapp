import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	AuditLogDetail,
	AuditLogListItem,
	FindAuditLogsResponse,
	GetAuditLogActionsResponse,
} from '@org/client-ts/src/models/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffAuditLogsQueryVariables = {
	actions?: string[];
	startDate?: string;
	endDate?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffAuditLogDetailsQueryVariables = {
	logId: string;
};

export type StaffAuditLogExportFormat = 'csv' | 'json';

export type StaffAuditLogExportInput = {
	format: StaffAuditLogExportFormat;
	actions?: string[];
	startDate?: string;
	endDate?: string;
};

export type StaffAuditLogRow = {
	id: string;
	action: string | null;
	userName: string | null;
	userEmail: string | null;
	ipAddress: string | null;
	targetId: string | null;
	createdAt: Date | null;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation/removal key from this. */
export const STAFF_AUDIT_LOGS_QUERY_KEY = ['staff-audit-logs'] as const;
export const STAFF_AUDIT_LOG_DETAILS_QUERY_KEY = [
	...STAFF_AUDIT_LOGS_QUERY_KEY,
	'detail',
] as const;
const STAFF_AUDIT_LOG_ACTIONS_QUERY_KEY = [
	...STAFF_AUDIT_LOGS_QUERY_KEY,
	'actions',
] as const;

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

const normalizeDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const normalizeActions = (
	actions: string[] | undefined,
): string[] | undefined => {
	if (!actions || actions.length === 0) {
		return undefined;
	}

	const normalized: string[] = [];
	const seen = new Set<string>();

	for (const action of actions) {
		const trimmed = action.trim();
		if (trimmed.length === 0 || seen.has(trimmed)) {
			continue;
		}

		seen.add(trimmed);
		normalized.push(trimmed);
	}

	return normalized.length > 0 ? normalized : undefined;
};

export const buildFindStaffAuditLogsQueryParameters = (
	variables: StaffAuditLogsQueryVariables,
): {
	actions?: string;
	startDate?: string;
	endDate?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
} => {
	const actions = normalizeActions(variables.actions);

	return {
		// The backend binds multi-value action filters as a single CSV string
		// (Kiota exposes the param as a primitive — see the FindAuditLogs
		// handler's AuditLogActionsCsv).
		actions: actions?.join(','),
		startDate: normalizeString(variables.startDate),
		endDate: normalizeString(variables.endDate),
		sortId: normalizeString(variables.sortId),
		sortOrder: variables.sortOrder,
		cursor: normalizeString(variables.cursor),
		limit: isPositiveSafeInteger(variables.size)
			? String(variables.size)
			: undefined,
	};
};

export const toStaffAuditLogRows = (
	items: AuditLogListItem[] | null | undefined,
): StaffAuditLogRow[] => {
	const rows: StaffAuditLogRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id ?? undefined);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			action: normalizeNullableString(item.action),
			userName: normalizeNullableString(item.userName),
			userEmail: normalizeNullableString(item.userEmail),
			ipAddress: normalizeNullableString(item.ipAddress),
			targetId: normalizeNullableString(item.targetId),
			createdAt: normalizeDate(item.createdAt),
		});
	}

	return rows;
};

const staffAuditLogsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindAuditLogsResponse,
	StaffAuditLogsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_AUDIT_LOGS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.auditLogs.get({
				queryParameters: buildFindStaffAuditLogsQueryParameters(variables),
			});

			if (!result) {
				throw new Error('staff audit logs result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffAuditLogActionsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetAuditLogActionsResponse,
	Record<string, never>
>(
	{
		queryKeyFn: () => [...STAFF_AUDIT_LOG_ACTIONS_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.staff.auditLogs.actions.get();

			if (!result) {
				throw new Error('staff audit log actions result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffAuditLogDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	AuditLogDetail,
	StaffAuditLogDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_AUDIT_LOG_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.auditLogs
				.byLogId(variables.logId)
				.get();

			if (!result) {
				throw new Error('staff audit log details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const exportStaffAuditLogsMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ArrayBuffer | undefined,
	StaffAuditLogExportInput
>(
	{
		mutationKeyFn: () => [...STAFF_AUDIT_LOGS_QUERY_KEY, 'export'],
		mutationFn: (client, variables) => {
			const actions = normalizeActions(variables.actions);

			return client.staff.auditLogs.exportEscaped.get({
				queryParameters: {
					format: variables.format,
					actions: actions?.join(','),
					startDate: normalizeString(variables.startDate),
					endDate: normalizeString(variables.endDate),
				},
			});
		},
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffAuditLogsQuery = (
	variables: StaffAuditLogsQueryVariables,
) =>
	useQuery({
		queryKey: staffAuditLogsQueryOptions.queryKey(variables),
		queryFn: () => staffAuditLogsQueryOptions.fetcher(variables),
	});

export const useAuditLogActionsQuery = () =>
	useQuery({
		queryKey: staffAuditLogActionsQueryOptions.queryKey({}),
		queryFn: () => staffAuditLogActionsQueryOptions.fetcher({}),
	});

export const useStaffAuditLogDetailsQuery = (
	variables: StaffAuditLogDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffAuditLogDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffAuditLogDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useExportStaffAuditLogsMutation = () =>
	useMutation(exportStaffAuditLogsMutationOptions);
