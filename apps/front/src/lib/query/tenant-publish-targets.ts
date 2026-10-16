import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type {
	DestinationLimits,
	TextLimit,
} from '~/lib/text-counter/text-counter';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	GetPublishTargetsForTenantResponse,
	PublishTargetItem,
	PublishTargetLimits,
} from '@org/client-ts/models/index';
import {
	buildTenantQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

/** @internal Unscoped — `scopedKey('tenant', …)` + tenantId is the only way to
 * build an invalidation/removal key from this. */
export const TENANT_PUBLISH_TARGETS_QUERY_KEY = [
	'tenant-publish-targets',
] as const;

export type TenantPublishTarget = {
	id: string;
	label: string | null;
	provider: string;
	/** Effective capability (text, images); null when the API sent none. */
	limits: DestinationLimits | null;
};

/** The server's attach-time image caps (any destination): the picker's cap
 * while no destination limits are known. Null when the API sent none. */
export const toAttachLimits = (
	data: GetPublishTargetsForTenantResponse | null | undefined,
): Pick<
	DestinationLimits,
	'maxImages' | 'maxImageBytes' | 'acceptedImageContentTypes'
> | null => {
	const wire = data?.attachLimits;
	if (
		!wire ||
		typeof wire.maxImages !== 'number' ||
		typeof wire.maxImageBytes !== 'number' ||
		!wire.acceptedImageContentTypes
	) {
		return null;
	}
	return {
		maxImages: wire.maxImages,
		maxImageBytes: wire.maxImageBytes,
		acceptedImageContentTypes: wire.acceptedImageContentTypes,
	};
};

/** Wire vocabulary this composer can actually drive (Pixelfed and Discord:
 * #2175). An unknown provider is dropped fail-closed instead of rendering a
 * checkbox whose publish path does not exist. */
const SUPPORTED_PROVIDERS = new Set([
	'bluesky',
	'mastodon',
	'pixelfed',
	'discord_webhook',
]);

// ── Row mapper ─────────────────────────────────────────────────────

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

/** A URL-weighted unit (Mastodon) is uncountable without its weight. */
const toTextLimit = (
	unit: string,
	max: number,
	urlWeight: number | null | undefined,
): TextLimit => {
	const textLimit: TextLimit = { unit, max };
	if (typeof urlWeight === 'number') {
		textLimit.urlWeight = urlWeight;
	}
	return textLimit;
};

const toDestinationLimits = (
	wire: PublishTargetLimits | null | undefined,
): DestinationLimits | null => {
	if (
		!wire ||
		typeof wire.maxImages !== 'number' ||
		typeof wire.maxImageBytes !== 'number' ||
		!wire.textLimits ||
		!wire.acceptedImageContentTypes
	) {
		return null;
	}

	return {
		textLimits: wire.textLimits.flatMap((limit) =>
			limit && typeof limit.unit === 'string' && typeof limit.max === 'number'
				? [toTextLimit(limit.unit, limit.max, limit.urlWeight)]
				: [],
		),
		maxImages: wire.maxImages,
		maxImageBytes: wire.maxImageBytes,
		acceptedImageContentTypes: wire.acceptedImageContentTypes,
		requiresMedia: wire.requiresMedia === true,
		supportsThreads: wire.supportsThreads !== false,
	};
};

const toTenantPublishTarget = (
	item: PublishTargetItem,
): TenantPublishTarget | null => {
	const id = normalizeString(item.id?.toString());

	if (!id || typeof item.provider !== 'string') {
		return null;
	}

	const provider = item.provider.trim();

	if (!SUPPORTED_PROVIDERS.has(provider)) {
		return null;
	}

	const limits = toDestinationLimits(item.limits);

	return { id, label: item.label ?? null, provider, limits };
};

/** Fail-closed row mapper for `GET /publishing/publish-targets`: a target
 * without an id is dropped rather than rendered as a broken checkbox. */
export const toTenantPublishTargets = (
	data: GetPublishTargetsForTenantResponse | null | undefined,
): TenantPublishTarget[] => {
	const targets: TenantPublishTarget[] = [];

	for (const item of data?.items ?? []) {
		if (item === null) {
			continue;
		}

		const target = toTenantPublishTarget(item);

		if (target) {
			targets.push(target);
		}
	}

	return targets;
};

// ── Query options ──────────────────────────────────────────────────

export type TenantPublishTargetsQueryVariables = {
	projectId?: string | null;
};

export const tenantPublishTargetsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	GetPublishTargetsForTenantResponse,
	TenantPublishTargetsQueryVariables
>(
	{
		queryKeyFn: () => [...TENANT_PUBLISH_TARGETS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.publishing.publishTargets.get(
				variables.projectId
					? { queryParameters: { projectId: variables.projectId } }
					: {},
			);

			if (!result) {
				throw new Error('tenant publish targets result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

// ── Hook ───────────────────────────────────────────────────────────

export const useTenantPublishTargetsQuery = (
	variables: TenantPublishTargetsQueryVariables & { tenantId: string },
) =>
	useQuery({
		queryKey: tenantPublishTargetsQueryOptions.queryKey(variables),
		queryFn: () => tenantPublishTargetsQueryOptions.fetcher(variables),
	});

// ── Invalidation ───────────────────────────────────────────────────

export const invalidateTenantPublishTargets = (
	qc: QueryClient,
	tenantId: string,
) =>
	qc.invalidateQueries({
		queryKey: [
			...scopedKey('tenant', TENANT_PUBLISH_TARGETS_QUERY_KEY),
			tenantId,
		],
		exact: true,
	});
