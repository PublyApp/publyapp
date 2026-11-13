import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '~/components/ui/label';
import { useImageUploadFailureMessage } from '~/lib/i18n/use-image-upload-failure-message';
import {
	useAttachPostImageMutation,
	useRemovePostImageMutation,
	useReorderPostImagesMutation,
	useUpdatePostImageAltMutation,
	useInvalidatePostImageCaches,
} from '~/lib/query/tenant-post-images';
import type { TenantPostImage } from '~/lib/query/tenant-post-images';

import { PostImageAddRow } from './_post-image-add-row';
import { LockedImageCards, PostImageCard } from './_post-image-card';
import { useOversizeImageCheck } from './_use-oversize-image-check';
import type { ImageLimits } from './_use-publish-selection';

const NO_LOCKED_IMAGES: readonly TenantPostImage[] = [];

export type DeferredImageSelection = {
	/** Stable key for the card; assigned by the picker. */
	id: string;
	/** The follow-up segment (its composer key) the image belongs to; absent
	 * for the post's own images. The parent stamps it (see
	 * `_deferred-images.ts`); the picker never reads it. */
	segmentKey?: string;
	file: File;
	altText: string;
	/** Set by the parent once the file is attached, so a retry after a failed
	 * alt-text step resumes instead of attaching the file twice. */
	attachedAssetId?: string;
};

let deferredSelectionCounter = 0;
const nextSelectionId = () => {
	deferredSelectionCounter += 1;
	return `deferred-image-${deferredSelectionCounter}`;
};

type PickerCard = {
	key: string;
	url: string | null;
	file: File | null;
	altText: string;
	/** Why the image cannot be published as it is; empty = none. */
	error: string;
};

const onlineCards = (
	images: TenantPostImage[],
	altDrafts: Record<string, string>,
): PickerCard[] =>
	images.map((image) => ({
		key: image.id ?? image.url,
		url: image.url,
		file: null,
		altText:
			(image.id ? altDrafts[image.id] : undefined) ?? image.altText ?? '',
		error: '',
	}));

/** A stricter destination chosen later can leave a queued file above the cap:
 * it stays, marked, never hidden or dropped. */
const deferredCards = (
	selections: DeferredImageSelection[],
	oversizeError: (file: File) => string,
): PickerCard[] =>
	selections.map((selection) => ({
		key: selection.id,
		url: null,
		file: selection.file,
		altText: selection.altText,
		error: oversizeError(selection.file),
	}));

const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
	if (to < 0 || to >= items.length) {
		return items;
	}

	const next = [...items];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) {
		return items;
	}
	next.splice(to, 0, moved);
	return next;
};

/**
 * Single owner of a post's image concerns (up to the destinations' cap, ordered, each with alt
 * text), with two modes:
 *
 * - Online (`postId` set): picks attach one by one against the API, alt text
 *   commits on blur, reorder and remove act immediately; the grid renders the
 *   server's `existingImages` (the caches refetch after every change).
 * - Deferred (no `postId`, `onSelect` set — create drawer): the parent owns
 *   the list of picked files and alt drafts and attaches them right after the
 *   post exists, so the composer can offer images before there is a post.
 *
 * With `segmentId` (online) the same picker manages one follow-up segment's
 * images (0-4, #2181): same upload flow, alt text, retry and limits, only the
 * list addressed and the label differ. Deferred follow-up pickers get their
 * own `selections` slice from the parent.
 *
 * Every server failure is surfaced inline through `getFailureMessage` (never
 * hand-translated at the call site). A missing alt text is a gentle nudge,
 * never a block.
 */
export const PostImagePicker = ({
	postId,
	tenantId,
	existingImages = [],
	selections = [],
	onSelect,
	disabled,
	limits = null,
	segmentId,
	label,
	idKey,
	hardMax,
	header,
	lockedImages = NO_LOCKED_IMAGES,
}: {
	postId?: string;
	/** Required for the online mode's tenant-scoped API client. */
	tenantId?: string;
	existingImages?: TenantPostImage[];
	/** Deferred mode: the parent-owned selections (single source of truth). */
	selections?: DeferredImageSelection[];
	onSelect?: (selections: DeferredImageSelection[]) => void;
	disabled?: boolean;
	/** Caps shared by the selected destinations; null = no cap known yet. */
	limits?: ImageLimits | null;
	/** Online only: the stored follow-up segment whose images these are. */
	segmentId?: string;
	/** Heading of the list; defaults to the post's "Images". */
	label?: string;
	/** Distinguishes the field ids of several pickers on one page. */
	idKey?: string;
	/** A cap that holds even while the destinations' limits are unknown
	 * (a follow-up never takes more than 4). */
	hardMax?: number;
	/** Shown right under the label (a follow-up's "2/4 images" count). */
	header?: ReactNode;
	/** Images already stored that this list cannot change (a partial attach):
	 * shown first as read-only cards and counted against the cap. */
	lockedImages?: readonly TenantPostImage[];
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const checkOversize = useOversizeImageCheck(limits);
	const imageUploadFailureMessage = useImageUploadFailureMessage();
	const maxImages = Math.min(
		limits?.maxImages ?? Number.POSITIVE_INFINITY,
		hardMax ?? Number.POSITIVE_INFINITY,
	);
	const isOnline = Boolean(postId);
	const attachImage = useAttachPostImageMutation();
	const removeImage = useRemovePostImageMutation();
	const reorderImages = useReorderPostImagesMutation();
	const updateAlt = useUpdatePostImageAltMutation();
	const invalidateCaches = useInvalidatePostImageCaches();

	const [failureMessage, setFailureMessage] = useState('');
	const [limitNotice, setLimitNotice] = useState(false);
	// Online alt drafts by asset id: typed values shown until the refetch
	// brings the committed text back.
	const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});

	const showFailure = (
		error: unknown,
		action: 'upload' | 'update' = 'update',
	) => {
		setFailureMessage(imageUploadFailureMessage(error, action));
	};

	const isBusy =
		attachImage.isPending ||
		removeImage.isPending ||
		reorderImages.isPending ||
		updateAlt.isPending;
	const isControlDisabled = Boolean(disabled) || isBusy;

	const locked = lockedImages.length;
	const count = (isOnline ? existingImages.length : selections.length) + locked;
	const isFull = count >= maxImages;

	// Sequential on purpose (each append takes the next position), so it
	// recurses instead of looping.
	const attachInOrder = async (files: File[]): Promise<void> => {
		const [file, ...rest] = files;
		if (!file) {
			return;
		}

		await attachImage.mutateAsync({
			postId: postId as string,
			tenantId: tenantId ?? '',
			file,
			segmentId,
		});
		await attachInOrder(rest);
	};

	const attachOnline = async (files: File[]) => {
		try {
			await attachInOrder(files);
		} catch (error) {
			showFailure(error, 'upload');
		} finally {
			invalidateCaches();
		}
	};

	const handleFiles = async (picked: File[]) => {
		const room = maxImages - count;
		setLimitNotice(picked.length > room);
		const { fitting, tooLarge } = checkOversize(picked);
		setFailureMessage(tooLarge);
		const accepted = fitting.slice(0, Math.max(room, 0));
		if (accepted.length === 0) {
			return;
		}

		if (!isOnline) {
			onSelect?.([
				...selections,
				...accepted.map((file) => ({
					id: nextSelectionId(),
					file,
					altText: '',
				})),
			]);
			return;
		}

		await attachOnline(accepted);
	};

	const runOnline = async (action: () => Promise<void>) => {
		setFailureMessage('');
		try {
			await action();
		} catch (error) {
			showFailure(error);
		} finally {
			invalidateCaches();
		}
	};

	const handleRemove = async (index: number) => {
		setLimitNotice(false);
		if (!isOnline) {
			onSelect?.(selections.filter((_, position) => position !== index));
			return;
		}

		const assetId = existingImages[index]?.id;
		if (!assetId) {
			return;
		}
		await runOnline(async () => {
			await removeImage.mutateAsync({
				postId: postId as string,
				tenantId: tenantId ?? '',
				assetId,
				segmentId,
			});
		});
	};

	const handleMove = async (from: number, to: number) => {
		if (
			to < 0 ||
			to >= (isOnline ? existingImages.length : selections.length)
		) {
			return;
		}
		if (!isOnline) {
			onSelect?.(moveItem(selections, from, to));
			return;
		}

		const ids = existingImages.flatMap((image) => (image.id ? [image.id] : []));
		if (ids.length !== existingImages.length) {
			return;
		}
		await runOnline(async () => {
			await reorderImages.mutateAsync({
				postId: postId as string,
				tenantId: tenantId ?? '',
				assetIds: moveItem(ids, from, to),
				segmentId,
			});
		});
	};

	const handleAltChange = (index: number, value: string) => {
		if (!isOnline) {
			onSelect?.(
				selections.map((selection, position) =>
					position === index ? { ...selection, altText: value } : selection,
				),
			);
			return;
		}

		const assetId = existingImages[index]?.id;
		if (assetId) {
			setAltDrafts((previous) => ({ ...previous, [assetId]: value }));
		}
	};

	const handleAltCommit = async (index: number) => {
		if (!isOnline) {
			return;
		}

		const image = existingImages[index];
		const draft = image?.id ? altDrafts[image.id] : undefined;
		if (!image?.id || draft === undefined) {
			return;
		}
		if (draft.trim() === (image.altText ?? '')) {
			return;
		}

		const assetId = image.id;
		await runOnline(async () => {
			await updateAlt.mutateAsync({
				postId: postId as string,
				tenantId: tenantId ?? '',
				assetId,
				altText: draft.trim(),
				segmentId,
			});
		});
	};

	const cards = isOnline
		? onlineCards(existingImages, altDrafts)
		: deferredCards(selections, (file) => checkOversize([file]).tooLarge);

	const inputId = `post-image-input-${idKey ?? segmentId ?? postId ?? 'new'}`;
	// No image type is shared by every selected destination (#2174): an empty
	// accept list would let the browser offer ALL files, so adding is off instead.
	const hasNoCommonType =
		limits !== null && limits.acceptedImageContentTypes.length === 0;
	const addDisabled = isControlDisabled || isFull || hasNoCommonType;

	return (
		<div className="space-y-2">
			<Label>{label ?? t('posts:images-label')}</Label>
			{header}
			{cards.length + locked > 0 ? (
				<ul className="space-y-2">
					<LockedImageCards
						images={lockedImages}
						idPrefix={`${inputId}-stored`}
						total={cards.length + locked}
					/>
					{cards.map((card, index) => (
						<PostImageCard
							key={card.key}
							index={index + locked}
							firstMovableIndex={locked}
							idPrefix={inputId}
							count={cards.length + locked}
							url={card.url}
							file={card.file}
							altText={card.altText}
							error={card.error}
							disabled={isControlDisabled}
							onAltChange={(value) => handleAltChange(index, value)}
							onAltCommit={() => void handleAltCommit(index)}
							onMoveEarlier={() => void handleMove(index, index - 1)}
							onMoveLater={() => void handleMove(index, index + 1)}
							onRemove={() => void handleRemove(index)}
						/>
					))}
				</ul>
			) : null}
			<PostImageAddRow
				inputId={inputId}
				label={label}
				limits={limits}
				maxImages={Number.isFinite(maxImages) ? maxImages : null}
				addDisabled={addDisabled}
				isFull={isFull}
				hasNoCommonType={hasNoCommonType}
				showLimitNotice={limitNotice && count > 0}
				failureMessage={failureMessage}
				onPick={(files) => void handleFiles(files)}
			/>
		</div>
	);
};
