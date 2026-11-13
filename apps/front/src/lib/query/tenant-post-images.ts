import {
	MultipartBody,
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { resolveApiFileUrl } from '~/lib/api-client/resolve-api-file-url';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { PostImageAttached } from '@org/client-ts/models/index';
import {
	buildTenantMutationOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

const TENANT_POST_IMAGE_MUTATION_KEY = ['tenant-posts', 'image'] as const;

/** Normalized image projection shared by the post detail and list read
 * models. `url` is resolved against the API origin so `<img src>` never falls
 * back to the front origin (see {@link resolveApiFileUrl}). */
export type TenantPostImage = {
	/** Asset id: the key for per-image alt text, remove and reorder. */
	id: string | null;
	url: string;
	widthPx: number | null;
	heightPx: number | null;
	altText: string | null;
};

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

export const toTenantPostImage = (raw: unknown): TenantPostImage | null => {
	// The generated client types the detail/list image field as a union that
	// includes an empty marker interface, so the normalizer reads fields
	// defensively instead of trusting one wire shape.
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const record = raw as Record<string, unknown>;
	const url = typeof record.url === 'string' ? record.url : undefined;
	if (!isNonEmptyString(url)) {
		return null;
	}

	return {
		id: isNonEmptyString(record.id) ? record.id : null,
		url: resolveApiFileUrl(url.trim()),
		widthPx: typeof record.widthPx === 'number' ? record.widthPx : null,
		heightPx: typeof record.heightPx === 'number' ? record.heightPx : null,
		altText: isNonEmptyString(record.altText) ? record.altText : null,
	};
};

/** Normalizes the read model's ordered `images` list; entries without a
 * usable url are dropped. */
export const toTenantPostImages = (raw: unknown): TenantPostImage[] => {
	if (!Array.isArray(raw)) {
		return [];
	}

	return raw.flatMap((entry) => {
		const image = toTenantPostImage(entry);
		return image ? [image] : [];
	});
};

// ── Attach (multipart POST) ────────────────────────────────────────

export type AttachPostImageInput = {
	postId: string;
	/** Scopes the tenant API client (X-Tenant-Id); required by the factory. */
	tenantId: string;
	file: File;
	/** A follow-up segment's stored id: the image belongs to that segment, not
	 * to the post's own list (#2181). */
	segmentId?: string;
};

/** Which image list a call addresses: the post's own, or a follow-up
 * segment's. Both expose the same routes. */
type ImageScope = { postId: string; segmentId?: string };

const imagesOf = (client: ApiClient, { postId, segmentId }: ImageScope) =>
	segmentId === undefined
		? client.posts.byPostId(postId).images
		: client.posts.byPostId(postId).segments.bySegmentId(segmentId).images;

/** Multipart builders touch only the file bytes; postId/tenantId are
 * transport concerns owned by the mutation factories. */
const buildMultipart = async (input: {
	file: File;
}): Promise<MultipartBody> => {
	const body = new MultipartBody();
	const content = new Uint8Array(await input.file.arrayBuffer());
	body.addOrReplacePart(
		'file',
		input.file.type || 'application/octet-stream',
		content,
		undefined,
		input.file.name,
	);

	return body;
};

/**
 * Builds the attach multipart body. Exported for tests; production callers go
 * through {@link useAttachPostImageMutation}.
 */
export const buildAttachPostImageBody = async (
	input: AttachPostImageInput,
): Promise<MultipartBody> => buildMultipart({ file: input.file });

const attachPostImageMutationOptions = buildTenantMutationOptions<
	ApiClient,
	PostImageAttached | undefined,
	AttachPostImageInput
>(
	{
		mutationKeyFn: () => [...TENANT_POST_IMAGE_MUTATION_KEY, 'attach'],
		mutationFn: async (client, variables) =>
			variables.segmentId === undefined
				? client.posts.byPostId(variables.postId).image.post(
						await buildMultipart({
							file: variables.file,
						}),
					)
				: client.posts
						.byPostId(variables.postId)
						.segments.bySegmentId(variables.segmentId)
						.images.post(await buildMultipart({ file: variables.file })),
		// The picker owns attach/remove/alt errors inline next to the input.
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useAttachPostImageMutation = () =>
	useMutation(attachPostImageMutationOptions);

// ── Remove one image (DELETE by asset id) ──────────────────────────

const removePostImageMutationOptions = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{ postId: string; tenantId: string; assetId: string; segmentId?: string }
>(
	{
		mutationKeyFn: () => [...TENANT_POST_IMAGE_MUTATION_KEY, 'remove'],
		mutationFn: async (client, variables) =>
			imagesOf(client, variables).byAssetId(variables.assetId).delete(),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useRemovePostImageMutation = () =>
	useMutation(removePostImageMutationOptions);

// ── Alt text (PATCH one image by asset id) ─────────────────────────

const updatePostImageAltMutationOptions = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{
		postId: string;
		tenantId: string;
		assetId: string;
		altText: string;
		segmentId?: string;
	}
>(
	{
		mutationKeyFn: () => [...TENANT_POST_IMAGE_MUTATION_KEY, 'alt'],
		mutationFn: async (client, variables) =>
			imagesOf(client, variables)
				.byAssetId(variables.assetId)
				.patch({ altText: createUntypedString(variables.altText) }),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useUpdatePostImageAltMutation = () =>
	useMutation(updatePostImageAltMutationOptions);

// ── Reorder (PATCH the full id list in the wanted order) ───────────

/** Builds the reorder body: every image id of the post, in the new order. */
export const buildReorderPostImagesBody = (assetIds: string[]) => ({
	assetIds: createUntypedArray(assetIds.map((id) => createUntypedString(id))),
});

const reorderPostImagesMutationOptions = buildTenantMutationOptions<
	ApiClient,
	unknown,
	{
		postId: string;
		tenantId: string;
		assetIds: string[];
		segmentId?: string;
	}
>(
	{
		mutationKeyFn: () => [...TENANT_POST_IMAGE_MUTATION_KEY, 'reorder'],
		mutationFn: async (client, variables) =>
			imagesOf(client, variables).order.patch(
				buildReorderPostImagesBody(variables.assetIds),
			),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useReorderPostImagesMutation = () =>
	useMutation(reorderPostImagesMutationOptions);

// ── Invalidation ───────────────────────────────────────────────────

/** Returns a callback invalidating every tenant post query (list + details)
 * after an image attach/remove/alt edit, so previews refetch the fresh
 * projection. Prefix matching intentionally spans tenants: image mutations
 * are rare and correctness beats narrow cache surgery here. */
export const useInvalidatePostImageCaches = () => {
	const queryClient = useQueryClient();

	return () => {
		void queryClient.invalidateQueries({
			queryKey: scopedKey('tenant', ['tenant-posts']),
		});
	};
};
