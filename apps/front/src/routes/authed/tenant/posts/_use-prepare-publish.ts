import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
	useRemovePostImageMutation,
	useReorderPostImagesMutation,
} from '~/lib/query/tenant-post-images';
import {
	invalidateTenantPosts,
	readCreatedSegments,
	savePost,
} from '~/lib/query/tenant-posts';
import type { TenantPostDetails } from '~/lib/query/tenant-posts';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { Attempt } from './_attempt';
import { imagesOfLiveSegments } from './_deferred-images';
import type { DeferredImageSelection } from './_post-image-picker';
import type { SegmentDraft } from './_segment-draft';
import type { PreparedPost } from './_use-publish-submit';

const isNotFound = (error: unknown): boolean => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' && failure.status === 404;
};

/** The group of images that are the post's own (a follow-up's is its key). */
const POST_GROUP = '';

/** An attached image the user took out of a picker (a follow-up's carries
 * its composer key, to be deleted from that segment's own list). */
type RemovedImage = { assetId: string; segmentKey?: string };

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
		attempt: Attempt,
		segmentIds: ReadonlyMap<string, string>,
	) => Promise<ReadonlyMap<string, string> | null>;
}) => {
	const qc = useQueryClient();
	const removeImage = useRemovePostImageMutation();
	const reorderImages = useReorderPostImagesMutation();
	const [createdPostId, setCreatedPostId] = useState<string | null>(null);
	// Attached images the user took out of a picker since: deleted from the
	// created post on the next try (a follow-up's from its own list).
	const [removed, setRemoved] = useState<RemovedImage[]>([]);
	// The picker keys in the order the created post holds each list of images
	// (the post's own under POST_GROUP, a follow-up's under its key), or null
	// when that is not known (an upload attempt failed part-way).
	const [serverKeys, setServerKeys] = useState<Record<string, string[]> | null>(
		null,
	);
	// The stored id of each follow-up of the created post: the SINGLE source
	// for naming stored segments (a save names them so images follow their
	// text; an image attaches to its segment's id). `savedKeys` is the
	// composer key of each follow-up in the order the post last saved them, so
	// a later read maps by that order, never by the composer's current one.
	// `ids` is null while unknown (a read failed).
	const storedSegments = useRef<{
		postId: string;
		savedKeys: string[];
		ids: ReadonlyMap<string, string> | null;
	} | null>(null);

	const segmentIdsOf = (postId: string): ReadonlyMap<string, string> =>
		storedSegments.current?.postId === postId
			? (storedSegments.current.ids ?? new Map())
			: new Map();

	/** Reads the post's follow-ups and maps them to the composer keys of the
	 * last save, or null when the read does not match what was saved. */
	const readSegmentIds = async (
		postId: string,
	): Promise<ReadonlyMap<string, string> | null> => {
		const saved = storedSegments.current;
		if (saved?.postId !== postId) {
			return null;
		}
		const stored = await readCreatedSegments(tenantId, postId);
		const ids =
			stored.length === saved.savedKeys.length &&
			stored.every((segment) => segment.id !== '')
				? new Map(
						saved.savedKeys.map((key, index) => [key, stored[index]?.id ?? '']),
					)
				: null;
		if (storedSegments.current?.postId === postId) {
			storedSegments.current = { ...saved, ids };
		}
		return ids;
	};

	/** Reads the stored follow-up ids again ("Try again" after a read that
	 * came back empty); an empty map when they cannot be told. */
	const refreshSegmentIds = async (
		postId: string,
	): Promise<ReadonlyMap<string, string>> =>
		(await readSegmentIds(postId)) ?? new Map();

	/** Saves the draft (creating the post, or updating the one an earlier
	 * click created), remembers the created post and the stored id of each
	 * follow-up. Stored segments are named only when every id is known: an
	 * unknown one would read as "new segment" and replace the thread. */
	const saveDraft = async (
		values: PostFormValues,
	): Promise<TenantPostDetails> => {
		const known =
			createdPostId === null
				? null
				: (storedSegments.current?.ids ??
					(await readSegmentIds(createdPostId)));
		const input: Parameters<typeof savePost>[0] = {
			postId: createdPostId ?? undefined,
			body: values.body,
			projectId: values.projectId ?? null,
			segments: values.segments.map((segment) => segment.text),
			tenantId,
		};
		if (known !== null) {
			input.segmentIds = values.segments.map((segment) =>
				known.get(segment.id),
			);
		}
		const details = await savePost(input);
		// Even a Save that fails later must not create a second post on retry.
		setCreatedPostId(details.id);
		// The post exists and is recorded: now an ended session may surface.
		if (details.segmentsReadError !== undefined) {
			throw details.segmentsReadError;
		}
		const savedKeys = values.segments.map((segment) => segment.id);
		storedSegments.current = { postId: details.id, savedKeys, ids: null };
		// An update answers without its segments (a create reads them back):
		// the stored ones are read once more, in the order just saved.
		if (savedKeys.length === 0) {
			storedSegments.current.ids = new Map();
		} else if (details.segments.length === savedKeys.length) {
			storedSegments.current.ids = new Map(
				savedKeys.map((key, index) => [key, details.segments[index]?.id ?? '']),
			);
		} else {
			await readSegmentIds(details.id);
		}
		return details;
	};

	/** A retry re-sends the picker order of one list of images, but only when
	 * the post's own order differs (or is unknown) and the list covers every
	 * attached image. */
	const reorderIfNeeded = async (
		postId: string,
		group: string,
		keys: string[],
		attached: ReadonlyMap<string, string>,
		segmentId: string | undefined,
	) => {
		if (createdPostId === null || keys.length < 2) {
			return;
		}
		// New images are appended by the upload, after the ones already there.
		const current = new Set(keys);
		const stored = serverKeys?.[group];
		const known = new Set(stored);
		const expected =
			stored === undefined
				? null
				: [
						...stored.filter((key) => current.has(key)),
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
		await reorderImages.mutateAsync({ postId, tenantId, assetIds, segmentId });
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
		attempt: Attempt,
	): Promise<ReadonlyMap<string, string> | null> => {
		const segmentIds = segmentIdsOf(postId);
		// A follow-up that is gone from the composer took its images with it
		// (the server drops them with the segment): nothing to delete or send.
		const liveKeys = new Set(
			methods.getValues('segments').map((segment) => segment.id),
		);
		const images = imagesOfLiveSegments(deferredImages, [...liveKeys]);
		const pending = removed.filter(
			({ segmentKey }) => segmentKey === undefined || liveKeys.has(segmentKey),
		);
		const deletions = await attempt.run(
			Promise.allSettled(
				pending.map(({ assetId, segmentKey }) =>
					removeImage.mutateAsync({
						postId,
						tenantId,
						assetId,
						segmentId:
							segmentKey === undefined ? undefined : segmentIds.get(segmentKey),
					}),
				),
			),
		);
		if (!attempt.isCurrent()) {
			return null;
		}
		// Each image leaves the list as soon as its delete went through; a 404
		// means it is already gone. Only the failed ones are tried again.
		const failed = deletions.flatMap((deletion, index) =>
			deletion.status === 'rejected' && !isNotFound(deletion.reason)
				? [{ image: pending[index], reason: deletion.reason }]
				: [],
		);
		setRemoved(failed.flatMap(({ image }) => (image ? [image] : [])));
		if (failed[0] !== undefined) {
			throw failed[0].reason;
		}
		if (images.length === 0) {
			setServerKeys({});
			return new Map();
		}

		const attached = await tryAttach(postId, images, attempt, segmentIds);
		if (attached === null) {
			if (attempt.isCurrent()) {
				setServerKeys(null);
			}
			return null;
		}
		const keysByGroup = new Map<string, string[]>();
		for (const image of images) {
			const group = image.segmentKey ?? POST_GROUP;
			keysByGroup.set(group, [...(keysByGroup.get(group) ?? []), image.id]);
		}
		await attempt.run(
			Promise.all(
				[...keysByGroup].map(([group, keys]) =>
					reorderIfNeeded(
						postId,
						group,
						keys,
						attached,
						group === POST_GROUP ? undefined : segmentIds.get(group),
					),
				),
			),
		);
		if (!attempt.isCurrent()) {
			return null;
		}
		setServerKeys(Object.fromEntries(keysByGroup));
		setDeferredImages(
			images.map((image) => ({
				...image,
				attachedAssetId: attached.get(image.id) ?? image.attachedAssetId,
			})),
		);
		return attached;
	};

	/** Saves the draft, brings its images in line and hands the post back, or
	 * null when it must not go on: invalid form, a failed attach, or the
	 * attempt superseded (Cancel, unmount, a newer click) after any await. */
	const prepare = async (attempt: Attempt): Promise<PreparedPost | null> => {
		const values = methods.getValues();
		await methods.trigger();
		if (
			!attempt.isCurrent() ||
			!methods.formState.isValid ||
			!values.body.trim()
		) {
			return null;
		}

		const details = await attempt.run(saveDraft(values));
		if (!attempt.isCurrent()) {
			return null;
		}
		setCreatedPostId(details.id);

		const assetIdByKey = await syncImages(details.id, attempt);
		if (assetIdByKey === null) {
			return null;
		}
		await attempt.run(invalidateTenantPosts(qc, tenantId));
		if (!attempt.isCurrent()) {
			return null;
		}
		methods.reset({
			body: details.body,
			projectId: details.projectId,
			segments: values.segments,
		});
		return { postId: details.id, assetIdByKey, attempt };
	};

	return {
		prepare,
		syncImages,
		/** The ONE draft writer (Save, Publish, Schedule): creates the post or
		 * updates the created one, naming each follow-up's stored segment. */
		saveDraft,
		refreshSegmentIds,
		/** The post an earlier publish attempt created, if any (Save updates it). */
		createdPostId,
		/** Stores a new picker selection. Once a post was created, attached
		 * images that left the picker are remembered for deletion; alt text and
		 * order edits keep the post. */
		selectImages: (selections: DeferredImageSelection[]) => {
			if (createdPostId !== null) {
				const kept = new Set(selections.map((selection) => selection.id));
				const taken = deferredImages.flatMap((image) =>
					!kept.has(image.id) && image.attachedAssetId
						? [
								{
									assetId: image.attachedAssetId,
									segmentKey: image.segmentKey,
								},
							]
						: [],
				);
				if (taken.length > 0) {
					setRemoved((previous) => [...previous, ...taken]);
				}
			}
			setDeferredImages(selections);
		},
		forget: () => {
			setCreatedPostId(null);
			setRemoved([]);
			setServerKeys(null);
			storedSegments.current = null;
		},
	};
};
