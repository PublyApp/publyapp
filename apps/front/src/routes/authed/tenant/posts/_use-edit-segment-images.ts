import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useImageUploadFailureMessage } from '~/lib/i18n/use-image-upload-failure-message';
import {
	invalidateTenantPosts,
	readCreatedSegments,
	savePost,
} from '~/lib/query/tenant-posts';
import { invalidateTenantPublications } from '~/lib/query/tenant-publications';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';

import {
	AttemptCancelledError,
	AttemptTimedOutError,
	createAttemptRegistry,
} from './_attempt';
import type { Attempt } from './_attempt';
import { imagesOfLiveSegments, withSegmentImages } from './_deferred-images';
import type { DeferredImageSelection } from './_post-image-picker';
import { segmentsPayload } from './_segment-draft';
import type { SegmentDraft } from './_segment-draft';
import { useAttachDeferredImages } from './_use-attach-deferred-images';
import { useRaiseSessionEnd } from './_use-raise-session-end';

export type PostFormValues = {
	body: string;
	projectId?: string | null;
	segments: SegmentDraft[];
};

/** The saved follow-ups could not be matched to the composer's: the images
 * cannot be attached to the right segment. */
class SegmentIdsUnreadError extends Error {}

/**
 * Images picked for a follow-up the post does not hold yet (added in this
 * editing session). Picking is ONE action for the user: the post is saved
 * first (same writer as the Save button, keeping every typed field), the
 * stored id of each new follow-up is read back in the order just saved, then
 * the images attach to their segment. A failure keeps the picked files queued
 * with its cause; `retry` finishes the job (saving again only when a
 * follow-up still has no stored id).
 */
export const useEditSegmentImages = ({
	methods,
	postId,
	tenantId,
	hasStoredSegments,
	segments,
}: {
	/** The follow-ups as the form holds them now: files queued for one that
	 * is gone are dropped. */
	segments: readonly SegmentDraft[];
	methods: UseFormReturn<PostFormValues>;
	postId: string;
	tenantId: string;
	hasStoredSegments: boolean;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const imageUploadFailureMessage = useImageUploadFailureMessage();
	const qc = useQueryClient();
	const { attachAll } = useAttachDeferredImages(tenantId);
	const raiseSessionEnd = useRaiseSessionEnd();
	const [allQueued, setQueued] = useState<DeferredImageSelection[]>([]);
	const queued = imagesOfLiveSegments(
		allQueued,
		segments.map((draft) => draft.id),
	);
	const [failure, setError] = useState('');
	// A cause belongs to the files it stopped: with none left there is none.
	const error = queued.length > 0 ? failure : '';
	const [isWorking, setIsWorking] = useState(false);
	const workingRef = useRef(false);
	// One attempt per save-and-upload: leaving the page (a confirmed leave, a
	// back-link, unmount) supersedes it, so nothing more is saved, attached or
	// reset on its behalf (same scope as the drawer's, #2179).
	const [attempts] = useState(() => createAttemptRegistry());
	// Also when the page shows another post: its save must not touch this one.
	useEffect(() => attempts.invalidate, [attempts, postId]);

	// A remove or reorder clears the highlighted fields: the "fix the
	// highlighted fields" notice goes with them (an attach failure stays).
	const dismissFormNotice = () =>
		setError((current) =>
			current === t('posts:segment-images-fix-form') ? '' : current,
		);

	const failureText = (cause: unknown): string =>
		imageUploadFailureMessage(cause, 'update');

	const causeText = (cause: unknown): string => {
		if (cause instanceof SegmentIdsUnreadError) {
			return t('posts:segment-image-target-missing');
		}
		if (cause instanceof AttemptTimedOutError) {
			return t('posts:attempt-timed-out');
		}
		return failureText(cause);
	};

	const saveFirst = async (attempt: Attempt): Promise<boolean> => {
		// The Save button's own validation: a field error shows on its field.
		if (!(await attempt.run(methods.trigger()))) {
			setError(t('posts:segment-images-fix-form'));
			return false;
		}
		const values = methods.getValues();
		await attempt.run(
			savePost({
				postId,
				body: values.body,
				projectId: values.projectId ?? null,
				...segmentsPayload(values.segments, hasStoredSegments),
				tenantId,
			}),
		);
		// The stored follow-ups answer in the order just saved.
		const stored = await attempt.run(readCreatedSegments(tenantId, postId));
		if (stored.length !== values.segments.length) {
			throw new SegmentIdsUnreadError();
		}
		methods.reset({
			body: values.body,
			projectId: values.projectId,
			segments: values.segments.map((draft, index) => ({
				...draft,
				serverId: stored[index]?.id,
			})),
		});
		// Same refreshes as the Save button (#2053): the queue and the
		// calendar show the post's body.
		await attempt.run(invalidateTenantPosts(qc, tenantId));
		await attempt.run(invalidateTenantScheduledPublications(qc, tenantId));
		await attempt.run(invalidateTenantPublications(qc, tenantId));
		return true;
	};

	const run = async (images: DeferredImageSelection[]) => {
		if (workingRef.current || images.length === 0) {
			return;
		}
		workingRef.current = true;
		setIsWorking(true);
		setError('');
		const attempt = attempts.begin();
		try {
			const isUnsaved = images.some(
				(image) =>
					methods
						.getValues('segments')
						.find((draft) => draft.id === image.segmentKey)?.serverId ===
					undefined,
			);
			if (isUnsaved && !(await saveFirst(attempt))) {
				return;
			}
			const segmentIds = new Map(
				methods
					.getValues('segments')
					.flatMap((draft) =>
						draft.serverId === undefined
							? []
							: [[draft.id, draft.serverId] as const],
					),
			);
			const outcome = await attempt.run(
				attachAll(
					postId,
					images,
					attempt.isCurrent,
					{ remaining: images, assetIds: new Map<string, string>() },
					segmentIds,
				),
			);
			if (!attempt.isCurrent()) {
				return;
			}
			if (outcome.ok) {
				setQueued([]);
			} else if (!raiseSessionEnd(outcome.error)) {
				setQueued(outcome.remaining);
				setError(outcome.cause);
			}
		} catch (cause) {
			if (cause instanceof AttemptCancelledError || raiseSessionEnd(cause)) {
				return;
			}
			setError(causeText(cause));
		} finally {
			workingRef.current = false;
			setIsWorking(false);
		}
	};

	return {
		/** The picked files still to attach (all follow-ups), with their key. */
		queued,
		dismissFormNotice,
		/** Why the last try stopped, '' when it did not. */
		error,
		/** A save or an upload is in flight: the editor is read-only meanwhile. */
		isWorking,
		/** A picker reports its list: new files start the save and upload. */
		onPick: (segmentKey: string, next: DeferredImageSelection[]) => {
			const merged = withSegmentImages(queued, segmentKey, next);
			// The live files only: a removed follow-up's must never be sent.
			const isAdded = merged.length > queued.length;
			setQueued(merged);
			if (isAdded && error === '') {
				void run(merged);
			}
		},
		/** "Try again" after a failure. */
		retry: () => void run(queued),
	};
};

export type EditSegmentImagesState = ReturnType<typeof useEditSegmentImages>;
