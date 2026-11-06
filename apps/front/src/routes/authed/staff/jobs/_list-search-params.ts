import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

/** Shared URL-state shape for the three `/staff/jobs` list pages. Each page
 * adds its own resource-specific filters on top of the table base
 * (q/sort_id/sort_order/cursor/size). Multi-select filters are stored as a
 * comma-separated list so a hand-edited URL stays readable. */
type StaffJobsListFilters = {
	/** Queue: lowercase wire statuses (`pending,processing`). */
	status?: string;
	/** Dead-letter: external-state status ids (wire `external_state_status`). */
	externalStateStatus?: string;
	/** System-jobs: enabled values (`true,false`, wire `is_enabled`). */
	isEnabled?: string;
	/** Shared across the three pages (wire `job_type`). */
	jobType?: string;
	/** Shared across queue + dead-letter (wire `tenant_id`). */
	tenantId?: string;
	/** Job family, client-side filter (`publishing,email,accounts,maintenance`). */
	family?: string;
	/** Dead-letter triage state (`open,requeued,triaged`), client-side. */
	state?: string;
	/** Queue attempt state (`retry,first`), client-side. */
	retry?: string;
};

export type StaffJobsListSearchParams = TableSearchParams &
	StaffJobsListFilters;

export type StaffJobsListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	external_state_status?: unknown;
	is_enabled?: unknown;
	job_type?: unknown;
	tenant_id?: unknown;
	family?: unknown;
	state?: unknown;
	retry?: unknown;
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

/** A CSV filter restricted to a closed vocabulary, in the vocabulary's order. */
const parseCsvAgainst = <T extends string>(
	value: unknown,
	allowed: readonly T[],
): string | undefined => {
	const raw = normalizeString(value);
	if (!raw) {
		return undefined;
	}

	const allowedSet = new Set<string>(allowed);
	const chosen = new Set(
		raw
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token): token is T => allowedSet.has(token)),
	);
	const ordered = allowed.filter((token) => chosen.has(token));
	return ordered.length > 0 ? ordered.join(',') : undefined;
};

const QUEUE_STATUSES = ['pending', 'processing'] as const;
const SYSTEM_ENABLED_VALUES = ['true', 'false'] as const;
const JOB_FAMILIES = [
	'publishing',
	'email',
	'accounts',
	'maintenance',
] as const;
const DEAD_LETTER_STATES = ['open', 'requeued', 'triaged'] as const;
const RETRY_STATES = ['retry', 'first'] as const;

const parseStatusIdFilter = (value: unknown): string | undefined => {
	const raw = normalizeString(value);
	if (!raw) {
		return undefined;
	}

	const chosen = new Set(
		raw
			.split(',')
			.map((token) => token.trim())
			.filter((token) => /^\d+$/.test(token) && Number(token) <= 6),
	);
	const ordered = ['0', '1', '2', '3', '4', '5', '6'].filter((token) =>
		chosen.has(token),
	);
	return ordered.length > 0 ? ordered.join(',') : undefined;
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
		status: parseCsvAgainst(search.status, QUEUE_STATUSES),
		externalStateStatus: parseStatusIdFilter(search.external_state_status),
		isEnabled: parseCsvAgainst(search.is_enabled, SYSTEM_ENABLED_VALUES),
		jobType: parseJobTypeFilter(search.job_type),
		tenantId: parseTenantIdFilter(search.tenant_id),
		family: parseCsvAgainst(search.family, JOB_FAMILIES),
		state: parseCsvAgainst(search.state, DEAD_LETTER_STATES),
		retry: parseCsvAgainst(search.retry, RETRY_STATES),
	};
};

export type StaffJobsListWireParams = {
	status?: string;
	external_state_status?: string;
	is_enabled?: string;
	job_type?: string;
	tenant_id?: string;
	family?: string;
	state?: string;
	retry?: string;
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
	family: params.family,
	state: params.state,
	retry: params.retry,
});

/** Builds the cursor-reset scope: any filter change invalidates the in-memory
 * cursor history, so a stale cursor can never be replayed against a different
 * filter set. */
export const buildStaffJobsCursorResetKey = (
	params: StaffJobsListSearchParams,
): string =>
	[
		params.q ?? '',
		params.status ?? '',
		params.externalStateStatus ?? '',
		params.isEnabled ?? '',
		params.jobType ?? '',
		params.tenantId ?? '',
		params.family ?? '',
		params.state ?? '',
		params.retry ?? '',
	].join('\u001f');
