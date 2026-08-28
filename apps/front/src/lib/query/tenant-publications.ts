import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	FindPublicationsForTenantResponse,
	PublicationListItem,
	PublishNowBody,
} from '@org/client-ts/models/index';
import {
	buildTenantMutationOptions,
	buildTenantQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

/** @internal Unscoped — `scopedKey('tenant', …)` + tenantId is the only way to
 * build an invalidation/removal key from this. */
export const TENANT_PUBLICATIONS_QUERY_KEY = ['tenant-publications'] as const;

/** The exact wire vocabulary `PublicationWire.FormatStatus` emits — the CSV
 * `status` filter accepts nothing else (backend answers 422 on drift).
 * Module-private: consumers go through `isTenantPublicationStatus`. */
const TENANT_PUBLICATION_STATUSES = [
	'scheduled',
	'in_progress',
	'published',
	'failed',
	'paused',
] as const;

export type TenantPublicationStatus =
	(typeof TENANT_PUBLICATION_STATUSES)[number];

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
	updatedAt: Date | null;
};

// ── Status vocabulary guard ────────────────────────────────────────

export const isTenantPublicationStatus = (
	value: string,
): value is TenantPublicationStatus =>
	(TENANT_PUBLICATION_STATUSES as readonly string[]).includes(value);

const normalizeStatuses = (
	statuses: string[] | undefined,
): TenantPublicationStatus[] | undefined => {
	if (!statuses || statuses.length === 0) {
		return undefined;
	}

	const normalized: TenantPublicationStatus[] = [];
	const seen = new Set<string>();

	for (const status of statuses ?? []) {
		const trimmed = status.trim();

		if (!isTenantPublicationStatus(trimmed) || seen.has(trimmed)) {
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
		updatedAt: normalizeDate(item.updatedAt),
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

/** Wire body for `POST /posts/{postId}/publish-now`. The Kiota builder types
 * `accountIds` as an open `UntypedNode | null`, so the selected ids ride in a
 * Kiota untyped array; omitting the field entirely means "nothing checked". */
const buildPublishNowBody = (accountIds: string[]): PublishNowBody => {
	if (accountIds.length === 0) {
		return {};
	}

	return {
		accountIds: createUntypedArray(
			accountIds.map((id) => createUntypedString(id)),
		),
	};
};

export const publishNowMutation = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{ postId: string; accountIds: string[] }
>(
	{
		mutationKeyFn: () => [...TENANT_PUBLICATIONS_QUERY_KEY, 'publish-now'],
		mutationFn: async (client, variables) => {
			await client.posts
				.byPostId(variables.postId)
				.publishNow.post(buildPublishNowBody(variables.accountIds));
		},
		meta: { successMessage: 'publish-now-success' },
	},
	{ clientAccessor: getClientManager() },
);

// ── Invalidation ───────────────────────────────────────────────────

export const invalidateTenantPublications = (
	qc: QueryClient,
	tenantId: string,
) =>
	qc.invalidateQueries({
		queryKey: [...scopedKey('tenant', TENANT_PUBLICATIONS_QUERY_KEY), tenantId],
	});
