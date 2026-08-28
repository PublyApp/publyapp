import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

/** Shared URL-state shape for the three `/staff/jobs` list pages. Each page
 * adds exactly one resource-specific filter on top of the table base
 * (q/sort_id/sort_order/cursor/size). */
type StaffJobsListFilters = {
	/** Queue: lowercase wire status (`pending`/`processing`). */
	status?: string;
	/** Dead-letter: external-state status id (wire `external_state_status`). */
	externalStateStatus?: string;
	/** System-jobs: enabled filter (wire `is_enabled`, values true/false). */
	isEnabled?: string;
	/** Shared across the three pages (wire `job_type`). */
	jobType?: string;
	/** Shared across queue + dead-letter (wire `tenant_id`). */
	tenantId?: string;
};

export type StaffJobsListSearchParams = TableSearchParams &
	StaffJobsListFilters;

export type StaffJobsListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	external_state_status?: unknown;
	is_enabled?: unknown;
	job_type?: unknown;
	tenant_id?: unknown;
};

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	return trimmed;
};

/** Queue status is a closed wire vocabulary; anything else falls back to no
 * filter rather than asking the backend to 400 a hand-edited URL. */
const parseQueueStatus = (value: unknown): string | undefined => {
	const normalized = normalizeString(value)?.toLowerCase();
	if (normalized === 'pending' || normalized === 'processing') {
		return normalized;
	}

	return undefined;
};

const parseBooleanFilter = (value: unknown): string | undefined => {
	const normalized = normalizeString(value);
	if (normalized === 'true' || normalized === 'false') {
		return normalized;
	}

	return undefined;
};

const parseStatusIdFilter = (value: unknown): string | undefined => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return undefined;
	}

	if (!/^\d+$/.test(normalized)) {
		return undefined;
	}

	return normalized;
};

const parseJobTypeFilter = normalizeString;

const parseTenantIdFilter = (value: unknown): string | undefined => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return undefined;
	}

	if (!/^[0-9a-f-]{36}$/i.test(normalized)) {
		return undefined;
	}

	return normalized;
};

export const parseStaffJobsListSearchParams = (
	search: StaffJobsListSearchParamInput,
): StaffJobsListSearchParams => {
	const base = parseTableSearchParams(search);

	return {
		...base,
		status: parseQueueStatus(search.status),
		externalStateStatus: parseStatusIdFilter(search.external_state_status),
		isEnabled: parseBooleanFilter(search.is_enabled),
		jobType: parseJobTypeFilter(search.job_type),
		tenantId: parseTenantIdFilter(search.tenant_id),
	};
};

export type StaffJobsListWireParams = {
	status?: string;
	external_state_status?: string;
	is_enabled?: string;
	job_type?: string;
	tenant_id?: string;
} & TableSearchWireParams;

export const serializeStaffJobsListSearchParams = (
	params: StaffJobsListSearchParams,
): StaffJobsListWireParams => ({
	...serializeTableSearchParams(params),
	status: params.status,
	external_state_status: params.externalStateStatus,
	is_enabled: params.isEnabled,
	job_type: params.jobType,
	tenant_id: params.tenantId,
});

/** Builds the cursor-reset scope: any filter change invalidates the in-memory
 * cursor history, so a stale cursor can never be replayed against a different
 * filter set. */
export const buildStaffJobsCursorResetKey = (
	params: StaffJobsListSearchParams,
): string =>
	[
		params.status ?? '',
		params.externalStateStatus ?? '',
		params.isEnabled ?? '',
		params.jobType ?? '',
		params.tenantId ?? '',
	].join('');
