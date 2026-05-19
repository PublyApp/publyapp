import isNil from 'lodash/isNil';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

// Query: Find Audit Logs (cursor-paginated)
type FindStaffAuditLogsParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	actions?: string[];
	userId?: string;
	targetId?: string;
	startDate?: string;
	endDate?: string;
};

export const useFindStaffAuditLogs = createStaffQuery({
	queryKeyFn: (client) => client.staff.auditLogs.get,
	fetcher: async (client, params: FindStaffAuditLogsParams) => {
		const result = await client.staff.auditLogs.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
				// Backend expects multi-value action filters as
				// CSV because Kiota exposes this query parameter
				// as a single string.
				actions:
					params.actions && params.actions.length > 0
						? params.actions.join(',')
						: undefined,
				userId: params.userId,
				targetId: params.targetId,
				startDate: params.startDate,
				endDate: params.endDate,
			},
		});
		if (isNil(result)) {
			throw new Error('useFindStaffAuditLogs: result is nil');
		}
		return result;
	},
});

type ExportStaffAuditLogsParams = {
	format: 'csv' | 'json';
	actions?: string[];
	userId?: string;
	targetId?: string;
	startDate?: string;
	endDate?: string;
};

export const useExportStaffAuditLogs = createStaffMutation({
	mutationKeyFn: (client) => client.staff.auditLogs.exportEscaped.get,
	mutationFn: async (client, params: ExportStaffAuditLogsParams) => {
		const result = await client.staff.auditLogs.exportEscaped.get({
			queryParameters: {
				format: params.format,
				// Backend expects multi-value action filters as
				// CSV because Kiota exposes this query parameter
				// as a single string.
				actions:
					params.actions && params.actions.length > 0
						? params.actions.join(',')
						: undefined,
				userId: params.userId,
				targetId: params.targetId,
				startDate: params.startDate,
				endDate: params.endDate,
			},
		});
		if (isNil(result)) {
			throw new Error('useExportStaffAuditLogs: result is nil');
		}
		return result;
	},
	meta: {
		// Export handles its own toast copy; keep the global
		// mutation handler from showing a duplicate error toast.
		skipGlobalErrorHandler: true,
	},
});

// Query: Get Single Audit Log by ID
type GetStaffAuditLogParams = {
	logId: string;
};

export const useGetStaffAuditLog = createStaffQuery({
	queryKeyFn: (client) => client.staff.auditLogs.byLogId('').get,
	fetcher: async (client, params: GetStaffAuditLogParams) => {
		const result = await client.staff.auditLogs.byLogId(params.logId).get();
		if (isNil(result)) {
			throw new Error('useGetStaffAuditLog: result is nil');
		}
		return result;
	},
});

// Query: Get Available Audit Log Actions
export const useGetStaffAuditLogActions = createStaffQuery({
	queryKeyFn: (client) => client.staff.auditLogs.actions.get,
	fetcher: async (client) => {
		const result = await client.staff.auditLogs.actions.get();
		if (isNil(result)) {
			throw new Error('useGetStaffAuditLogActions: result is nil');
		}
		return result;
	},
});
