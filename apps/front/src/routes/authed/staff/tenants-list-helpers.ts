import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

// Lifecycle order (mirrors the backend TenantStatus enum): a tenant is
// created Pending and activates when its first owner accepts the invitation.
const TENANT_STATUS_FILTERS = ['pending', 'active', 'suspended'] as const;
export type TenantStatusFilter = (typeof TENANT_STATUS_FILTERS)[number];

const TENANT_OCCUPANCY_FILTERS = ['full', 'high', 'available'] as const;
export type TenantOccupancyFilter = (typeof TENANT_OCCUPANCY_FILTERS)[number];

const TENANT_LOCALE_FILTERS = ['fr', 'en'] as const;
export type TenantLocaleFilter = (typeof TENANT_LOCALE_FILTERS)[number];

const TENANT_INVITATION_FILTERS = ['with', 'without'] as const;
export type TenantInvitationFilter = (typeof TENANT_INVITATION_FILTERS)[number];

const TENANT_STATUS_FILTER_SET = new Set<string>(TENANT_STATUS_FILTERS);
const TENANT_OCCUPANCY_FILTER_SET = new Set<string>(TENANT_OCCUPANCY_FILTERS);
const TENANT_LOCALE_FILTER_SET = new Set<string>(TENANT_LOCALE_FILTERS);
const TENANT_INVITATION_FILTER_SET = new Set<string>(TENANT_INVITATION_FILTERS);

export type TenantListSearchParams = TableSearchParams & {
	status: TenantStatusFilter[];
	occupancy: TenantOccupancyFilter[];
	locale: TenantLocaleFilter[];
	invitations: TenantInvitationFilter[];
};

export type TenantListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	occupancy?: unknown;
	locale?: unknown;
	invitations?: unknown;
};

/** A comma-separated multi-select, canonicalised to the known values' order. */
const parseChoiceFilter = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	knownValues: ReadonlySet<string>,
): T[] => {
	if (typeof value !== 'string') {
		return [];
	}

	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => knownValues.has(token)),
	);

	return allowed.filter((entry) => selected.has(entry));
};

const serializeChoiceFilter = <T extends string>(
	values: readonly T[],
	allowed: readonly T[],
): string | undefined => {
	const selected = new Set(values);
	const canonical = allowed.filter((entry) => selected.has(entry));
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

export const parseTenantStatusFilter = (value: unknown): TenantStatusFilter[] =>
	parseChoiceFilter(value, TENANT_STATUS_FILTERS, TENANT_STATUS_FILTER_SET);

export const serializeTenantStatusFilter = (
	statuses: readonly TenantStatusFilter[],
): string | undefined => serializeChoiceFilter(statuses, TENANT_STATUS_FILTERS);

const parseTenantOccupancyFilter = (value: unknown): TenantOccupancyFilter[] =>
	parseChoiceFilter(
		value,
		TENANT_OCCUPANCY_FILTERS,
		TENANT_OCCUPANCY_FILTER_SET,
	);

const parseTenantLocaleFilter = (value: unknown): TenantLocaleFilter[] =>
	parseChoiceFilter(value, TENANT_LOCALE_FILTERS, TENANT_LOCALE_FILTER_SET);

const parseTenantInvitationFilter = (
	value: unknown,
): TenantInvitationFilter[] =>
	parseChoiceFilter(
		value,
		TENANT_INVITATION_FILTERS,
		TENANT_INVITATION_FILTER_SET,
	);

export const parseTenantListSearchParams = (
	search: TenantListSearchParamInput,
): TenantListSearchParams => ({
	...parseTableSearchParams(search),
	status: parseTenantStatusFilter(search.status),
	occupancy: parseTenantOccupancyFilter(search.occupancy),
	locale: parseTenantLocaleFilter(search.locale),
	invitations: parseTenantInvitationFilter(search.invitations),
});

export type TenantListWireParams = {
	status?: string;
	occupancy?: string;
	locale?: string;
	invitations?: string;
} & TableSearchWireParams;

export const serializeTenantListSearchParams = (
	params: TenantListSearchParams,
): TenantListWireParams => ({
	...serializeTableSearchParams(params),
	status: serializeTenantStatusFilter(params.status),
	occupancy: serializeChoiceFilter(params.occupancy, TENANT_OCCUPANCY_FILTERS),
	locale: serializeChoiceFilter(params.locale, TENANT_LOCALE_FILTERS),
	invitations: serializeChoiceFilter(
		params.invitations,
		TENANT_INVITATION_FILTERS,
	),
});
