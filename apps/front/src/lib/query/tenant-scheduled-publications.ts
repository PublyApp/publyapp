import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	FindScheduledPublicationsResponse,
	ScheduledPublicationItem,
} from '@org/client-ts/models/index';
import {
	buildTenantQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export const TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY = [
	'tenant-scheduled-publications',
] as const;

import {
	isPublicationWireStatus,
	type PublicationWireStatus,
} from '~/lib/publication-status';

const LOCAL_DATE_TIME_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

export type ScheduledPublicationStatus = PublicationWireStatus;

export type ScheduledPublicationsQueryVariables = {
	from: Date;
	to: Date;
	statuses?: string[];
	cursor?: string;
	limit?: number;
};

export type ScheduledPublicationRow = {
	id: string;
	publicationId: string;
	postId: string | null;
	postBodyPreview: string | null;
	accountDisplayHandle: string | null;
	status: string | null;
	postStatus: string | null;
	scheduledAtUtc: Date;
	scheduledAtLocal: string;
	timeZone: string | null;
};

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

const normalizeStatuses = (
	statuses: string[] | undefined,
): ScheduledPublicationStatus[] | undefined => {
	if (!statuses || statuses.length === 0) {
		return undefined;
	}

	const normalized: ScheduledPublicationStatus[] = [];
	const seen = new Set<string>();
	for (const status of statuses) {
		const trimmed = status.trim();
		if (!isPublicationWireStatus(trimmed) || seen.has(trimmed)) {
			continue;
		}

		seen.add(trimmed);
		normalized.push(trimmed);
	}

	return normalized.length > 0 ? normalized : undefined;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const buildFindScheduledPublicationsQueryParameters = (
	variables: ScheduledPublicationsQueryVariables,
) => {
	const statuses = normalizeStatuses(variables.statuses);

	return {
		from: variables.from.toISOString(),
		to: variables.to.toISOString(),
		status: statuses?.join(','),
		cursor: normalizeString(variables.cursor),
		limit: isPositiveSafeInteger(variables.limit)
			? String(variables.limit)
			: undefined,
	};
};

const normalizeScheduledInstant = (
	value: Date | null | undefined,
): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

export const scheduledLocalCivilDate = (
	scheduledAtLocal: string,
): string | null => {
	const match = LOCAL_DATE_TIME_PATTERN.exec(scheduledAtLocal);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
	if (
		candidate.getUTCFullYear() !== year ||
		candidate.getUTCMonth() !== month - 1 ||
		candidate.getUTCDate() !== day ||
		candidate.getUTCHours() !== hour ||
		candidate.getUTCMinutes() !== minute
	) {
		return null;
	}

	return scheduledAtLocal.slice(0, 10);
};

const toScheduledPublicationRow = (
	item: ScheduledPublicationItem,
): ScheduledPublicationRow | null => {
	const publicationId = normalizeString(item.publicationId?.toString());
	const scheduledAtUtc = normalizeScheduledInstant(item.scheduledAtUtc);
	const scheduledAtLocal = normalizeString(item.scheduledAtLocal);
	if (
		!publicationId ||
		!scheduledAtUtc ||
		!scheduledAtLocal ||
		!scheduledLocalCivilDate(scheduledAtLocal)
	) {
		return null;
	}

	return {
		id: publicationId,
		publicationId,
		postId: normalizeNullableString(item.postId?.toString()),
		postBodyPreview: normalizeNullableString(item.postBodyPreview),
		accountDisplayHandle: normalizeNullableString(item.accountDisplayHandle),
		status: normalizeNullableString(item.status),
		postStatus: normalizeNullableString(item.postStatus),
		scheduledAtUtc,
		scheduledAtLocal,
		timeZone: normalizeNullableString(item.timeZone),
	};
};

export const toScheduledPublicationRows = (
	data: FindScheduledPublicationsResponse | null | undefined,
): ScheduledPublicationRow[] => {
	const rows: ScheduledPublicationRow[] = [];
	for (const item of data?.data ?? []) {
		const row = toScheduledPublicationRow(item);
		if (row) {
			rows.push(row);
		}
	}

	return rows;
};

export const scheduledPublicationsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	FindScheduledPublicationsResponse,
	ScheduledPublicationsQueryVariables
>(
	{
		queryKeyFn: () => [...TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.posts.publications.get({
				queryParameters:
					buildFindScheduledPublicationsQueryParameters(variables),
			});
			if (!result) {
				throw new Error('scheduled publications result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useScheduledPublicationsQuery = (
	variables: ScheduledPublicationsQueryVariables & { tenantId: string },
) =>
	useQuery({
		queryKey: scheduledPublicationsQueryOptions.queryKey(variables),
		queryFn: () => scheduledPublicationsQueryOptions.fetcher(variables),
	});

export type ScheduledPublicationsInfiniteVariables = {
	from: Date;
	to: Date;
	statuses?: string[];
	limit?: number;
};

const buildInfiniteVariablesPayload = (
	variables: ScheduledPublicationsInfiniteVariables & { tenantId: string },
) => ({
	from: variables.from.toISOString(),
	to: variables.to.toISOString(),
	status: normalizeStatuses(variables.statuses)?.join(','),
	limit: isPositiveSafeInteger(variables.limit)
		? String(variables.limit)
		: undefined,
});

/**
 * Tenant-scoped infinite walk for one bounded window.
 *
 * The query key encodes `tenant` + `tenant-scheduled-publications` + the
 * tenant id + the window/status/limit payload + the `restartKey`. The cursor
 * lives only inside `pageParam`, so an `invalidateQueries` against the
 * tenant scope (the contract `invalidateTenantScheduledPublications` already
 * honours) reaches every page of the walk and forces a full refetch — no
 * React state shadows the cached data.
 *
 * The cursor-cycle guard uses `allPageParams` (the pageParams TanStack Query
 * passes back to `getNextPageParam`): if a server hands back a `nextCursor`
 * we've already requested on any prior page, the walk terminates instead of
 * looping forever. A well-behaved backend returns `null`/`''` to mark the end;
 * a malicious or buggy backend that recycles a cursor is short-circuited here.
 */
export const useScheduledPublicationsInfiniteQuery = (
	variables: ScheduledPublicationsInfiniteVariables & {
		tenantId: string;
		restartKey?: number;
	},
) => {
	const { tenantId, from, to, statuses, limit, restartKey } = variables;
	const clientManager = getClientManager();
	const baseQueryKey = [
		'tenant',
		...TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY,
		tenantId,
		buildInfiniteVariablesPayload({ tenantId, from, to, statuses, limit }),
		restartKey ?? 0,
	] as const;

	return useInfiniteQuery({
		queryKey: baseQueryKey,
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam, signal }) => {
			const client = clientManager.getOrCreateClient(tenantId);
			const result = await client.posts.publications.get({
				queryParameters: buildFindScheduledPublicationsQueryParameters({
					from,
					to,
					statuses,
					cursor: pageParam,
					limit,
				}),
			});
			if (!result) {
				throw new Error('scheduled publications result was empty');
			}
			void signal;
			return result;
		},
		getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
			const next = lastPage.nextCursor;
			if (typeof next !== 'string' || next.length === 0) {
				return undefined;
			}
			if (allPageParams.includes(next)) {
				return undefined;
			}
			return next;
		},
	});
};

/** Invalidates every scheduled-publication window for one tenant. */
export const invalidateTenantScheduledPublications = (
	qc: QueryClient,
	tenantId: string,
) =>
	qc.invalidateQueries({
		queryKey: [
			...scopedKey('tenant', TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY),
			tenantId,
		],
	});
