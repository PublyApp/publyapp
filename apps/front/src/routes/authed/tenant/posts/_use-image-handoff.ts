import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
	AttemptCancelledError,
	AttemptTimedOutError,
	createAttemptRegistry,
} from './_attempt';
import type { Attempt } from './_attempt';
import type { DeferredImageSelection } from './_post-image-picker';
import { useAttachDeferredImages } from './_use-attach-deferred-images';
import type { AttachProgress } from './_use-attach-deferred-images';
import { useRaiseSessionEnd } from './_use-raise-session-end';

/**
 * The create drawer's image handoff: the deferred picker selection, and what
 * happens once the post EXISTS but its images did not attach. The drawer must
 * not close over that (the user would come back to a phantom "image attached"
 * memory), so it offers "Try again" / "Discard".
 *
 * A Publish or Schedule click that stopped because of that failure leaves a
 * resume (#2179): "Try again" attaches AND sends that request. Every step runs
 * inside an attempt (a generation): Cancel/close, unmount, a Save or a newer
 * Publish supersede it, so nothing of the old attempt attaches, resumes or
 * publishes afterwards. Cancel is never blocked.
 */
export const useImageHandoff = (tenantId: string) => {
	const { t } = useTranslation(['posts', 'common']);
	const deferredAttach = useAttachDeferredImages(tenantId);
	const raiseSessionEnd = useRaiseSessionEnd();
	// The parent OWNS the deferred selection (the picker reports through
	// `onSelect`), so the attachment survives the picker's re-renders and the
	// handoff can hold it for a retry.
	const [deferredImages, setDeferredImages] = useState<
		DeferredImageSelection[]
	>([]);
	const [postId, setPostId] = useState<string | null>(null);
	const [cause, setCause] = useState('');
	// The follow-up (composer key) of the image the attach stopped on.
	const [failedSegmentKey, setFailedSegmentKey] = useState<string>();
	const [isRetrying, setIsRetrying] = useState(false);
	const [resumeRequested, setResumeRequested] = useState(0);
	const stoppedByAttachRef = useRef(false);
	const resumeRef = useRef<(() => void) | null>(null);
	// The stored id of each follow-up (by composer key) the last attach ran
	// with: "Try again" attaches to the same segments.
	const segmentIdsRef = useRef<ReadonlyMap<string, string>>(new Map());
	const [attempts] = useState(() => createAttemptRegistry());

	const clearIntent = () => {
		stoppedByAttachRef.current = false;
		resumeRef.current = null;
	};

	// Unmount (route change, back) supersedes whatever is in flight.
	useEffect(() => attempts.invalidate, [attempts]);

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
	 * of each image (by its local id) when the handoff completed; null when it
	 * failed (the handoff then holds the images, the attached ones marked, with
	 * the surfaced cause) or when the attempt was superseded meanwhile.
	 */
	const attach = async (
		forPostId: string,
		images: DeferredImageSelection[],
		attempt: Attempt,
		segmentIds: ReadonlyMap<string, string>,
	): Promise<ReadonlyMap<string, string> | null> => {
		segmentIdsRef.current = segmentIds;
		const progress: AttachProgress = {
			remaining: images,
			assetIds: new Map<string, string>(),
		};
		// A timeout stops the upload chain too (it ends at the next step), and the
		// images that landed before the deadline stay marked attached, so a retry
		// uploads only the missing ones.
		let abandoned = false;
		const work = deferredAttach.attachAll(
			forPostId,
			images,
			() => attempt.isCurrent() && !abandoned,
			progress,
			segmentIds,
		);
		const outcome = await attempt.run(work).catch((error: unknown) => {
			if (error instanceof AttemptTimedOutError) {
				abandoned = true;
				// An upload that was already on the wire may still land: mark it
				// attached when it does, so a retry does not append it twice.
				void work.then(() => {
					if (attempt.isCurrent()) {
						setDeferredImages((current) =>
							current.map((image) => ({
								...image,
								attachedAssetId:
									image.attachedAssetId ?? progress.assetIds.get(image.id),
							})),
						);
					}
				});
				return {
					ok: false as const,
					remaining: progress.remaining,
					assetIds: progress.assetIds,
					cause: t('posts:image-timed-out'),
					error,
				};
			}
			return null;
		});
		if (outcome === null || !attempt.isCurrent()) {
			return null;
		}
		if (outcome.ok) {
			stoppedByAttachRef.current = false;
			return outcome.assetIds;
		}

		// An ended session goes to the central logout, not to the panel.
		if (raiseSessionEnd(outcome.error)) {
			return null;
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
		setFailedSegmentKey(outcome.remaining[0]?.segmentKey);
		return null;
	};

	/** The attach of a Publish / Schedule / Save attempt. A success ends the
	 * earlier failure's panel and cause (the intent itself was already dropped
	 * by `beginAttempt`; the clear here is belt and braces). */
	const tryAttach = async (
		forPostId: string,
		images: DeferredImageSelection[],
		attempt: Attempt,
		segmentIds: ReadonlyMap<string, string>,
	): Promise<ReadonlyMap<string, string> | null> => {
		const attached = await attach(forPostId, images, attempt, segmentIds);
		if (attached !== null) {
			setPostId(null);
			setCause('');
			resumeRef.current = null;
		}
		return attached;
	};

	/** "Try again": attaches what is left, then resumes the publish that was
	 * stopped, or calls `finish` when it was a plain save. */
	const retryAttach = async (
		finish: () => Promise<void>,
		refreshSegmentIds: (postId: string) => Promise<ReadonlyMap<string, string>>,
	) => {
		if (!postId || deferredImages.length === 0) {
			return;
		}
		// The whole retry is ONE attempt, the id look-up included: Cancel,
		// Discard or a newer click during it supersedes it, so nothing is
		// attached or finished afterwards (#2179). The button stays busy.
		const attempt = attempts.begin();
		const keptResume = resumeRef.current;
		setCause('');
		setIsRetrying(true);
		try {
			await retryAttempt(
				attempt,
				postId,
				keptResume,
				finish,
				refreshSegmentIds,
			);
		} catch (error) {
			if (error instanceof AttemptCancelledError || raiseSessionEnd(error)) {
				return;
			}
			setCause(
				error instanceof AttemptTimedOutError
					? t('posts:image-timed-out')
					: t('common:an-error-occurred'),
			);
		} finally {
			setIsRetrying(false);
		}
	};

	const retryAttempt = async (
		attempt: Attempt,
		postId: string,
		keptResume: (() => void) | null,
		finish: () => Promise<void>,
		refreshSegmentIds: (postId: string) => Promise<ReadonlyMap<string, string>>,
	) => {
		// A follow-up whose stored id was unknown is looked up again, or the
		// retry would fail the same way.
		const isIdMissing = deferredImages.some(
			(image) =>
				image.segmentKey !== undefined &&
				!segmentIdsRef.current.has(image.segmentKey),
		);
		if (isIdMissing) {
			const ids = await attempt.run(refreshSegmentIds(postId));
			if (!attempt.isCurrent()) {
				return;
			}
			segmentIdsRef.current = ids;
		}
		const attached = await attach(
			postId,
			deferredImages,
			attempt,
			segmentIdsRef.current,
		);
		if (attached === null || !attempt.isCurrent()) {
			return;
		}
		if (keptResume === null) {
			await finish();
			return;
		}
		// Keep the post, mark the images attached, and send the stopped request.
		resumeRef.current = keptResume;
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
		isPending: deferredAttach.isPending || isRetrying,
		/** The post whose images are still to attach, or null. */
		postId,
		cause,
		failedSegmentKey,
		tryAttach,
		retryAttach,
		/** Starts a Publish / Schedule / Save attempt: it supersedes every
		 * earlier one, its resume included. */
		beginAttempt: (): Attempt => {
			clearIntent();
			return attempts.begin();
		},
		/** The block reports a stopped Publish/Schedule: keep it only when the
		 * attach was the reason. */
		keepIntent: (resume: () => void) => {
			if (stoppedByAttachRef.current) {
				resumeRef.current = resume;
			}
		},
		clearIntent,
		/** Leaves no handoff, intent, selection or request of the old session
		 * alive: supersedes the attempt in flight. */
		reset: () => {
			attempts.invalidate();
			clearIntent();
			segmentIdsRef.current = new Map();
			setDeferredImages([]);
			setPostId(null);
			setCause('');
		},
	};
};
