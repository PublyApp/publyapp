import { createUntypedString } from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { WireDestination } from '~/lib/publishing/destination-overrides';
import { toUntypedDestinations } from '~/lib/query/publication-wire';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	FindPublicationsForTenantResponse,
	PublicationListItem,
	PublishNowBody,
	SchedulePostBody,
} from '@org/client-ts/models/index';
import {
	buildTenantMutationOptions,
	buildTenantQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

/** @internal Unscoped — `scopedKey('tenant', …)` + tenantId is the only way to
 * build an invalidation/removal key from this. */
export const TENANT_PUBLICATIONS_QUERY_KEY = ['tenant-publications'] as const;

import {
	isPublicationWireStatus,
	type PublicationWireStatus,
} from '~/lib/publishing/publication-status';

export type TenantPublicationsQueryVariables = {
	/** Raw values (URL state arrives as strings); validated against the
	 * `TENANT_PUBLICATION_STATUSES` vocabulary at build time — unknown entries
	 * are dropped fail-closed so the wire never carries drift (the backend
	 * answers 422 on any unknown status). */
	statuses?: string[];
	cursor?: string;
	limit?: number;
};

export type TenantPublicationRow = {
	id: string;
	postId: string | null;
	socialAccountId: string | null;
	accountLabel: string | null;
	postExcerpt: string | null;
	status: string | null;
	externalUrl: string | null;
	lastError: string | null;
	/** Failure category wire value on Failed/Paused rows (#647). */
	failureCategory: string | null;
	attempts: number;
	/** The account is Active (not needs-reconnect / revoked / gone). */
	accountUsable: boolean;
	/** A newer publication exists for the same post and account. */
	superseded: boolean;
	/** The destination overrides part of the post's content (it has a rendition). */
	customized: boolean;
	updatedAt: Date | null;
	/** Thread progress: segments published so far / total segments (1 = plain post). */
	segmentsPublished: number;
	segmentsTotal: number;
};

// ── Status vocabulary guard ────────────────────────────────────────

/** Backward-compat re-export — prefer isPublicationWireStatus. */
export const isTenantPublicationStatus = isPublicationWireStatus;

const normalizeStatuses = (
	statuses: string[] | undefined,
): PublicationWireStatus[] | undefined => {
	if (!statuses || statuses.length === 0) {
		return undefined;
	}

	const normalized: PublicationWireStatus[] = [];
	const seen = new Set<string>();

	for (const status of statuses ?? []) {
		const trimmed = status.trim();

		if (!isPublicationWireStatus(trimmed) || seen.has(trimmed)) {
			continue;
		}

		seen.add(trimmed);
		normalized.push(trimmed);
	}

	if (normalized.length === 0) {
		return undefined;
	}
	return normalized;
};

// ── Normalization helpers ──────────────────────────────────────────

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	return trimmed;
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

// ── Query parameter builder ────────────────────────────────────────

export const buildFindTenantPublicationsQueryParameters = (
	variables: TenantPublicationsQueryVariables,
) => {
	const statuses = normalizeStatuses(variables.statuses);

	return {
		// The backend binds multi-value status filters as a single CSV string
		// (Kiota exposes the param as a primitive — see the FindPublications
		// handler's PublicationStatusCsv).
		status: statuses?.join(','),
		cursor: normalizeString(variables.cursor),
		limit: isPositiveSafeInteger(variables.limit)
			? String(variables.limit)
			: undefined,
	};
};

// ── Row mapper ─────────────────────────────────────────────────────

export const toTenantPublicationRows = (
	data: FindPublicationsForTenantResponse | null | undefined,
): TenantPublicationRow[] => {
	const rows: TenantPublicationRow[] = [];

	for (const item of data?.data ?? []) {
		const row = toTenantPublicationRow(item);

		if (row) {
			rows.push(row);
		}
	}

	return rows;
};

const toTenantPublicationRow = (
	item: PublicationListItem,
): TenantPublicationRow | null => {
	const id = normalizeString(item.id?.toString());

	if (!id) {
		return null;
	}

	return {
		id,
		postId: normalizeNullableString(item.postId?.toString()),
		socialAccountId: normalizeNullableString(item.socialAccountId?.toString()),
		accountLabel: normalizeNullableString(item.accountLabel),
		postExcerpt: normalizeNullableString(item.postExcerpt),
		status: normalizeNullableString(item.status),
		externalUrl: normalizeNullableString(item.externalUrl),
		lastError: normalizeNullableString(item.lastError),
		failureCategory: normalizeNullableString(item.failureCategory),
		attempts: item.attempts ?? 0,
		accountUsable: item.accountUsable ?? false,
		superseded: item.superseded ?? false,
		customized: item.customized ?? false,
		updatedAt: normalizeDate(item.updatedAt),
		segmentsPublished: item.segmentsPublished ?? 0,
		segmentsTotal: item.segmentsTotal ?? 1,
	};
};

// ── Query options ──────────────────────────────────────────────────

export const tenantPublicationsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	FindPublicationsForTenantResponse,
	TenantPublicationsQueryVariables
>(
	{
		queryKeyFn: () => [...TENANT_PUBLICATIONS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.publishing.publications.get({
				queryParameters: buildFindTenantPublicationsQueryParameters(variables),
			});

			if (!result) {
				throw new Error('tenant publications result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

// ── Hook ───────────────────────────────────────────────────────────

export const useTenantPublicationsQuery = (
	variables: TenantPublicationsQueryVariables & { tenantId: string },
) =>
	useQuery({
		queryKey: tenantPublicationsQueryOptions.queryKey(variables),
		queryFn: () => tenantPublicationsQueryOptions.fetcher(variables),
	});

// ── Publish-now mutation (Task 8) ──────────────────────────────────

/** Wire body for `POST /posts/{postId}/publish-now` (#2172): one
 * `destinations[]` item per selected account, `overrides` only on the ones
 * that customize something. Kiota types the open field as an `UntypedNode`. */
const buildPublishNowBody = (
	destinations: WireDestination[],
): PublishNowBody =>
	destinations.length === 0
		? {}
		: { destinations: toUntypedDestinations(destinations) };

export const publishNowMutation = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{ postId: string; destinations: WireDestination[] }
>(
	{
		mutationKeyFn: () => [...TENANT_PUBLICATIONS_QUERY_KEY, 'publish-now'],
		mutationFn: async (client, variables) => {
			await client.posts
				.byPostId(variables.postId)
				.publishNow.post(buildPublishNowBody(variables.destinations));
		},
		meta: { successMessage: 'publish-now-success' },
	},
	{ clientAccessor: getClientManager() },
);

// ── Schedule mutation (#2172) ──────────────────────────────────────

/** Wire body for `POST /posts/{postId}/schedule`: `scheduledAtLocal` is the
 * "same time for all" instant (ISO 8601 UTC) every destination without its
 * own `scheduledAt` takes; `timeZone` is the IANA zone the schedule is shown in. */
const buildScheduleBody = (variables: {
	destinations: WireDestination[];
	scheduledAt: string;
	timeZone: string;
}): SchedulePostBody => ({
	destinations: toUntypedDestinations(variables.destinations),
	scheduledAtLocal: createUntypedString(variables.scheduledAt),
	timeZone: createUntypedString(variables.timeZone),
});

export const schedulePostMutation = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{
		postId: string;
		destinations: WireDestination[];
		scheduledAt: string;
		timeZone: string;
	}
>(
	{
		mutationKeyFn: () => [...TENANT_PUBLICATIONS_QUERY_KEY, 'schedule'],
		mutationFn: async (client, variables) => {
			await client.posts
				.byPostId(variables.postId)
				.schedule.post(buildScheduleBody(variables));
		},
		// The composer owns the feedback (inline failure, navigation on success).
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

// ── Retry mutation (#647) ──────────────────────────────────────────

/** `POST /posts/publications/{id}/retry`: re-queues a Failed/Paused
 * publication under its existing idempotency key. */
export const useRetryPublicationMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...TENANT_PUBLICATIONS_QUERY_KEY, 'retry'],
		mutationFn: async ({
			tenantId,
			publicationId,
		}: {
			tenantId: string;
			publicationId: string;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.posts.publications
				.byPublicationId(publicationId)
				.retry.post();
		},
		onSuccess: async (_data, variables) => {
			await invalidateTenantPublications(queryClient, variables.tenantId);
			await invalidateTenantScheduledPublications(
				queryClient,
				variables.tenantId,
			);
		},
		meta: { successMessage: 'publication-retry-success' },
	});
};

// ── Mark-as-published mutation (#2176) ─────────────────────────────

/** `POST /posts/publications/{id}/mark-published`: the user confirmed a
 * needs-review publication is on the provider. */
export const useMarkPublicationPublishedMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...TENANT_PUBLICATIONS_QUERY_KEY, 'mark-published'],
		mutationFn: async ({
			tenantId,
			publicationId,
		}: {
			tenantId: string;
			publicationId: string;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.posts.publications
				.byPublicationId(publicationId)
				.markPublished.post();
		},
		onSuccess: async (_data, variables) => {
			await invalidateTenantPublications(queryClient, variables.tenantId);
		},
		meta: { successMessage: 'publication-mark-published-success' },
	});
};

// ── Invalidation ───────────────────────────────────────────────────

export const invalidateTenantPublications = (
	qc: QueryClient,
	tenantId: string,
) =>
	qc.invalidateQueries({
		queryKey: [...scopedKey('tenant', TENANT_PUBLICATIONS_QUERY_KEY), tenantId],
	});
