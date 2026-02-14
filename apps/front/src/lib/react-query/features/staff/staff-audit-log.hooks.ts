import _ from 'lodash';

import { createStaffQuery } from '../../create-hooks';

// Query: Find Audit Logs (cursor-paginated)
type FindStaffAuditLogsParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	action?: string;
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
				action: params.action,
				userId: params.userId,
				targetId: params.targetId,
				startDate: params.startDate,
				endDate: params.endDate,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useFindStaffAuditLogs: result is nil');
		}
		return result;
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
		if (_.isNil(result)) {
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
		if (_.isNil(result)) {
			throw new Error('useGetStaffAuditLogActions: result is nil');
		}
		return result;
	},
});
