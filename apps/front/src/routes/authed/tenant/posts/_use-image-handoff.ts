import { useEffect, useRef, useState } from 'react';

import type { DeferredImageSelection } from './_post-image-picker';
import { useAttachDeferredImages } from './_use-attach-deferred-images';

/**
 * The create drawer's image handoff: the deferred picker selection, and what
 * happens once the post EXISTS but its images did not attach. The drawer must
 * not close over that (the user would come back to a phantom "image attached"
 * memory), so it offers "Try again" / "Discard".
 *
 * A Publish or Schedule click that stopped because of that failure leaves a
 * resume (#2179): "Try again" attaches AND sends that request. The resume is
 * kept only when THIS attempt was stopped by the attach (the flag is reset at
 * the start of every attempt), and it dies with the drawer: every close goes
 * through `reset`, which also invalidates a retry still in flight.
 */
export const useImageHandoff = (tenantId: string) => {
	const deferredAttach = useAttachDeferredImages(tenantId);
	// The parent OWNS the deferred selection (the picker reports through
	// `onSelect`), so the attachment survives the picker's re-renders and the
	// handoff can hold it for a retry.
	const [deferredImages, setDeferredImages] = useState<
		DeferredImageSelection[]
	>([]);
	const [postId, setPostId] = useState<string | null>(null);
	const [cause, setCause] = useState('');
	const [resumeRequested, setResumeRequested] = useState(0);
	const stoppedByAttachRef = useRef(false);
	const resumeRef = useRef<(() => void) | null>(null);
	// Bumped on every reset: an async step that began in an earlier session
	// (the drawer was closed meanwhile) must not touch state or resume.
	const sessionRef = useRef(0);

	const clearIntent = () => {
		stoppedByAttachRef.current = false;
		resumeRef.current = null;
	};

	// Runs after the render that holds the attached images, so the resumed
	// request sees them and uploads nothing twice.
	useEffect(() => {
		if (resumeRequested === 0) {
			return;
		}
		const resume = resumeRef.current;
		clearIntent();
		resume?.();
	}, [resumeRequested]);

	/**
	 * Attaches the deferred images to the created post. Resolves the asset id
	 * of each image (by its local id) when the handoff completed; null leaves
	 * the handoff holding the images (the attached ones marked) with the
	 * surfaced cause, so the drawer offers the retry/discard actions.
	 */
	const tryAttach = async (
		forPostId: string,
		images: DeferredImageSelection[],
	): Promise<ReadonlyMap<string, string> | null> => {
		const session = sessionRef.current;
		const outcome = await deferredAttach.attachAll(forPostId, images);
		if (session !== sessionRef.current) {
			return null;
		}
		if (outcome.ok) {
			stoppedByAttachRef.current = false;
			return outcome.assetIds;
		}

		stoppedByAttachRef.current = true;
		setPostId(forPostId);
		// Every image stays in the list, the attached ones marked: a retry
		// uploads only the rest, and a reorder or an image override still sees
		// all of them.
		setDeferredImages(
			images.map((image) => ({
				...image,
				attachedAssetId:
					outcome.assetIds.get(image.id) ?? image.attachedAssetId,
			})),
		);
		setCause(outcome.cause);
		return null;
	};

	/** "Try again": attaches what is left, then resumes the publish that was
	 * stopped, or calls `finish` when it was a plain save. */
	const retryAttach = async (finish: () => Promise<void>) => {
		if (!postId || deferredImages.length === 0) {
			return;
		}
		const session = sessionRef.current;
		setCause('');
		const attached = await tryAttach(postId, deferredImages);
		if (attached === null || session !== sessionRef.current) {
			return;
		}
		if (resumeRef.current === null) {
			await finish();
			return;
		}
		// Keep the post, mark the images attached, and send the stopped request.
		setDeferredImages(
			deferredImages.map((image) => ({
				...image,
				attachedAssetId: attached.get(image.id) ?? image.attachedAssetId,
			})),
		);
		setPostId(null);
		setCause('');
		setResumeRequested((count) => count + 1);
	};

	return {
		deferredImages,
		setDeferredImages,
		isPending: deferredAttach.isPending,
		/** The post whose images are still to attach, or null. */
		postId,
		cause,
		tryAttach,
		retryAttach,
		/** Call at the start of every Publish / Schedule / Save attempt. */
		beginAttempt: () => {
			stoppedByAttachRef.current = false;
		},
		/** The block reports a stopped Publish/Schedule: keep it only when the
		 * attach was the reason. */
		keepIntent: (resume: () => void) => {
			if (stoppedByAttachRef.current) {
				resumeRef.current = resume;
			}
		},
		clearIntent,
		/** Leaves no handoff, intent, selection or in-flight retry behind. */
		reset: () => {
			sessionRef.current += 1;
			clearIntent();
			setDeferredImages([]);
			setPostId(null);
			setCause('');
		},
	};
};
