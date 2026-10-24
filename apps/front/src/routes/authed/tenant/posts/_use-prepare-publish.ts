import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
	useRemovePostImageMutation,
	useReorderPostImagesMutation,
} from '~/lib/query/tenant-post-images';
import { invalidateTenantPosts, savePost } from '~/lib/query/tenant-posts';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { DeferredImageSelection } from './_post-image-picker';
import type { SegmentDraft } from './_segment-draft';
import type { PreparedPost } from './_use-publish-submit';

const isNotFound = (error: unknown): boolean => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' && failure.status === 404;
};

type PostFormValues = {
	body: string;
	projectId?: string | null;
	segments: SegmentDraft[];
};

/**
 * What the creation drawer does before a publish or schedule request: save
 * the draft, upload the picked images, and hand back the post with the asset
 * id of every picked image (a destination's image override names an image by
 * its local id until it exists).
 *
 * A failed publish leaves the drawer open for another try, so the created
 * post is remembered: the retry updates THAT post instead of creating a
 * second one, and the picked images stay in the picker marked as attached, so
 * their key to asset id mapping survives and nothing is uploaded twice. Alt
 * text and order edits keep the same post (the retry re-sends the alt texts
 * and the order); an attached image the user removed is deleted from the post
 * on the retry, and a newly picked one is uploaded then.
 */
export const usePreparePublish = ({
	methods,
	tenantId,
	deferredImages,
	setDeferredImages,
	tryAttach,
}: {
	methods: UseFormReturn<PostFormValues>;
	tenantId: string;
	deferredImages: DeferredImageSelection[];
	setDeferredImages: (images: DeferredImageSelection[]) => void;
	/** Attaches the images to the post: asset ids, or null after surfacing
	 * the handoff failure. */
	tryAttach: (
		postId: string,
		images: DeferredImageSelection[],
	) => Promise<ReadonlyMap<string, string> | null>;
}) => {
	const qc = useQueryClient();
	const removeImage = useRemovePostImageMutation();
	const reorderImages = useReorderPostImagesMutation();
	const [createdPostId, setCreatedPostId] = useState<string | null>(null);
	// Attached images the user took out of the picker since: deleted from the
	// created post on the next try.
	const [removedAssetIds, setRemovedAssetIds] = useState<string[]>([]);
	// The picker keys in the order the created post holds its images, or null
	// when that is not known (an upload attempt failed part-way).
	const [serverKeys, setServerKeys] = useState<string[] | null>(null);

	/** A retry re-sends the picker order, but only when the post's own order
	 * differs (or is unknown) and the list covers every attached image. */
	const reorderIfNeeded = async (
		postId: string,
		keys: string[],
		attached: ReadonlyMap<string, string>,
	) => {
		if (createdPostId === null || keys.length < 2) {
			return;
		}
		// New images are appended by the upload, after the ones already there.
		const current = new Set(keys);
		const known = new Set(serverKeys);
		const expected =
			serverKeys === null
				? null
				: [
						...serverKeys.filter((key) => current.has(key)),
						...keys.filter((key) => !known.has(key)),
					];
		if (expected !== null && expected.join('|') === keys.join('|')) {
			return;
		}
		const assetIds = keys.flatMap((key) => {
			const assetId = attached.get(key);
			return assetId === undefined ? [] : [assetId];
		});
		if (assetIds.length !== keys.length) {
			return;
		}
		await reorderImages.mutateAsync({ postId, tenantId, assetIds });
	};

	/**
	 * Brings the created post's images in line with the picker: deletes the
	 * attached images the user took out, uploads the picked ones not attached
	 * yet (marking every one attached), and on a retry re-sends the picker
	 * order. Resolves each image's asset id by its local key, or null after
	 * surfacing the handoff failure.
	 */
	const syncImages = async (
		postId: string,
	): Promise<ReadonlyMap<string, string> | null> => {
		const deletions = await Promise.allSettled(
			removedAssetIds.map((assetId) =>
				removeImage.mutateAsync({ postId, tenantId, assetId }),
			),
		);
		// Each id leaves the list as soon as its delete went through; a 404 means
		// it is already gone. Only the failed ones are tried again.
		const failed = deletions.flatMap((deletion, index) =>
			deletion.status === 'rejected' && !isNotFound(deletion.reason)
				? [{ assetId: removedAssetIds[index] ?? '', reason: deletion.reason }]
				: [],
		);
		setRemovedAssetIds(failed.map((entry) => entry.assetId));
		if (failed[0] !== undefined) {
			throw failed[0].reason;
		}
		if (deferredImages.length === 0) {
			setServerKeys([]);
			return new Map();
		}

		const attached = await tryAttach(postId, deferredImages);
		if (attached === null) {
			setServerKeys(null);
			return null;
		}
		const keys = deferredImages.map((image) => image.id);
		await reorderIfNeeded(postId, keys, attached);
		setServerKeys(keys);
		setDeferredImages(
			deferredImages.map((image) => ({
				...image,
				attachedAssetId: attached.get(image.id) ?? image.attachedAssetId,
			})),
		);
		return attached;
	};

	const prepare = async (): Promise<PreparedPost | null> => {
		const values = methods.getValues();
		await methods.trigger();
		if (!methods.formState.isValid || !values.body.trim()) {
			return null;
		}

		const details = await savePost({
			postId: createdPostId ?? undefined,
			body: values.body,
			projectId: values.projectId ?? null,
			segments: values.segments.map((segment) => segment.text),
			tenantId,
		});
		setCreatedPostId(details.id);

		const assetIdByKey = await syncImages(details.id);
		if (assetIdByKey === null) {
			return null;
		}
		await invalidateTenantPosts(qc, tenantId);
		methods.reset({
			body: details.body,
			projectId: details.projectId,
			segments: values.segments,
		});
		return { postId: details.id, assetIdByKey };
	};

	return {
		prepare,
		syncImages,
		/** The post an earlier publish attempt created, if any (Save updates it). */
		createdPostId,
		/** Stores a new picker selection. Once a post was created, attached
		 * images that left the picker are remembered for deletion; alt text and
		 * order edits keep the post. */
		selectImages: (selections: DeferredImageSelection[]) => {
			if (createdPostId !== null) {
				const kept = new Set(selections.map((selection) => selection.id));
				const removed = deferredImages.flatMap((image) =>
					!kept.has(image.id) && image.attachedAssetId
						? [image.attachedAssetId]
						: [],
				);
				if (removed.length > 0) {
					setRemovedAssetIds((previous) => [...previous, ...removed]);
				}
			}
			setDeferredImages(selections);
		},
		forget: () => {
			setCreatedPostId(null);
			setRemovedAssetIds([]);
			setServerKeys(null);
		},
	};
};
