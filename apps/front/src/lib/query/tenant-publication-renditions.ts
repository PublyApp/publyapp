import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type {
	RenditionOverrides,
	WireOverrides,
} from '~/lib/publishing/destination-overrides';
import { toRenditionBody } from '~/lib/query/publication-wire';
import { invalidateTenantPublications } from '~/lib/query/tenant-publications';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { RenditionResponse } from '@org/client-ts/models/index';
import {
	buildTenantQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

/** @internal Unscoped — `scopedKey('tenant', …)` + tenantId is the only way to
 * build an invalidation key from this. */
const TENANT_PUBLICATION_RENDITION_QUERY_KEY = [
	'tenant-publication-rendition',
] as const;

/** A publication's stored per-destination overrides (#2172). */
export type TenantPublicationRendition = {
	publicationId: string;
	customized: boolean;
	overrides: RenditionOverrides;
};

/** Fail-closed mapper for `GET /posts/publications/{id}/rendition`. */
export const toTenantPublicationRendition = (
	data: RenditionResponse | null | undefined,
): TenantPublicationRendition | null => {
	const publicationId = data?.publicationId?.toString();
	if (!publicationId) {
		return null;
	}

	const segments = (data?.segments ?? []).flatMap((segment) =>
		typeof segment.position === 'number' && typeof segment.text === 'string'
			? [{ position: segment.position, text: segment.text }]
			: [],
	);
	const assetIds = data?.media?.assetIds?.map((id) => id.toString()) ?? null;
	const altTexts = (data?.media?.altTexts ?? []).flatMap((alt) =>
		alt.assetId && typeof alt.altText === 'string'
			? [{ assetId: alt.assetId.toString(), altText: alt.altText }]
			: [],
	);

	return {
		publicationId,
		customized: data?.customized ?? false,
		overrides: {
			segments,
			// The API sends `media: null` for a destination that inherits the post's
			// images, but Kiota deserializes a null object field to an EMPTY object,
			// never to null. So a media override is read from its content: a stored
			// image list or alt texts. Anything else inherits (and is never sent).
			media:
				assetIds === null && altTexts.length === 0
					? null
					: { assetIds, altTexts },
		},
	};
};

export const tenantPublicationRenditionQueryOptions = buildTenantQueryOptions<
	ApiClient,
	RenditionResponse,
	{ publicationId: string }
>(
	{
		queryKeyFn: () => [...TENANT_PUBLICATION_RENDITION_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.posts.publications
				.byPublicationId(variables.publicationId)
				.rendition.get();

			if (!result) {
				throw new Error('publication rendition result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useTenantPublicationRenditionQuery = (
	variables: { publicationId: string; tenantId: string },
	opts?: { enabled?: boolean },
) =>
	useQuery({
		queryKey: tenantPublicationRenditionQueryOptions.queryKey(variables),
		queryFn: () => tenantPublicationRenditionQueryOptions.fetcher(variables),
		enabled: opts?.enabled ?? true,
	});

/**
 * Customizing a destination changes the rendition itself, the `customized`
 * flag on its queue/calendar and history rows, and (for a reset) nothing
 * else: refresh all three families (#359 line + lists).
 */
export const invalidateTenantPublicationRenditions = async (
	qc: QueryClient,
	tenantId: string,
): Promise<void> => {
	await qc.invalidateQueries({
		queryKey: [
			...scopedKey('tenant', TENANT_PUBLICATION_RENDITION_QUERY_KEY),
			tenantId,
		],
	});
	await invalidateTenantScheduledPublications(qc, tenantId);
	await invalidateTenantPublications(qc, tenantId);
};

/** `PUT /posts/publications/{id}/rendition`: replaces ALL of the destination's
 * overrides. The editor owns the feedback (inline failure and saved note), so
 * a 409 locked or a 422 naming the destination stays next to the form. */
export const useSavePublicationRenditionMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...TENANT_PUBLICATION_RENDITION_QUERY_KEY, 'save'],
		mutationFn: async ({
			tenantId,
			publicationId,
			overrides,
		}: {
			tenantId: string;
			publicationId: string;
			overrides: WireOverrides | null;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.posts.publications
				.byPublicationId(publicationId)
				.rendition.put(toRenditionBody(overrides));
		},
		onSuccess: (_data, variables) =>
			invalidateTenantPublicationRenditions(queryClient, variables.tenantId),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	});
};

/** `DELETE /posts/publications/{id}/rendition`: "Reset to shared". Like Save,
 * the editor owns the feedback (inline note or failure). */
export const useResetPublicationRenditionMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...TENANT_PUBLICATION_RENDITION_QUERY_KEY, 'reset'],
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
				.rendition.delete();
		},
		onSuccess: (_data, variables) =>
			invalidateTenantPublicationRenditions(queryClient, variables.tenantId),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	});
};
