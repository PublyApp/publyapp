import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { invalidateTenantPosts, savePost } from '~/lib/query/tenant-posts';

import type { DeferredImageSelection } from './_post-image-picker';
import type { SegmentDraft } from './_segment-draft';
import type { PreparedPost } from './_use-publish-submit';

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
 * their key to asset id mapping survives and nothing is uploaded twice.
 * Changing the picked images after the post was created starts over with a
 * new post (an attached image cannot be removed from here).
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
	const [createdPostId, setCreatedPostId] = useState<string | null>(null);

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

		let assetIdByKey: ReadonlyMap<string, string> = new Map();
		if (deferredImages.length > 0) {
			const attached = await tryAttach(details.id, deferredImages);
			if (attached === null) {
				return null;
			}
			assetIdByKey = attached;
			setDeferredImages(
				deferredImages.map((image) => ({
					...image,
					attachedAssetId: attached.get(image.id) ?? image.attachedAssetId,
				})),
			);
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
		/** The post an earlier publish attempt created, if any (Save updates it). */
		createdPostId,
		/** Stores a new picker selection; once a post was created, any change
		 * to the picked images starts a fresh post. */
		selectImages: (selections: DeferredImageSelection[]) => {
			if (createdPostId === null) {
				setDeferredImages(selections);
				return;
			}
			setCreatedPostId(null);
			setDeferredImages(
				selections.map((selection) => ({
					...selection,
					attachedAssetId: undefined,
				})),
			);
		},
		forget: () => setCreatedPostId(null),
	};
};
