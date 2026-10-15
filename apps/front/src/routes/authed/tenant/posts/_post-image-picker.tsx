import { IconPhotoPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '~/components/ui/label';
import {
	useAttachPostImageMutation,
	useRemovePostImageMutation,
	useReorderPostImagesMutation,
	useUpdatePostImageAltMutation,
	useInvalidatePostImageCaches,
} from '~/lib/query/tenant-post-images';
import type { TenantPostImage } from '~/lib/query/tenant-post-images';
import { cn } from '~/lib/utils';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { PostImageCard } from './_post-image-card';
import type { ImageLimits } from './_use-publish-selection';

/** Image caps come from the selected destinations' advertised capability
 * (`GET /publishing/publish-targets`); the server stays authoritative and
 * re-validates by magic-byte sniffing and a typed 422 on the excess image.
 * With no destination selected there is nothing to cap against yet. */
const FALLBACK_ACCEPT_ATTR = 'image/*';

const formatBytes = (bytes: number): string =>
	bytes >= 1_000_000
		? `${Number((bytes / 1_000_000).toFixed(1))} MB`
		: `${Math.ceil(bytes / 1000)} KB`;

const formatTypes = (types: string[]): string =>
	types.map((type) => type.replace('image/', '').toUpperCase()).join(', ');

export type DeferredImageSelection = {
	/** Stable key for the card; assigned by the picker. */
	id: string;
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
 * Single owner of a post's image concerns (up to four, ordered, each with alt
 * text), with two modes:
 *
 * - Online (`postId` set): picks attach one by one against the API, alt text
 *   commits on blur, reorder and remove act immediately; the grid renders the
 *   server's `existingImages` (the caches refetch after every change).
 * - Deferred (no `postId`, `onSelect` set — create drawer): the parent owns
 *   the list of picked files and alt drafts and attaches them right after the
 *   post exists, so the composer can offer images before there is a post.
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
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const maxImages = limits?.maxImages ?? Number.POSITIVE_INFINITY;
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

	const showFailure = (error: unknown) => {
		setFailureMessage(
			getFailureMessage(toApiFailure(error), {
				fallback: t('common:an-error-occurred'),
			}) ?? '',
		);
	};

	const isBusy =
		attachImage.isPending ||
		removeImage.isPending ||
		reorderImages.isPending ||
		updateAlt.isPending;
	const isControlDisabled = Boolean(disabled) || isBusy;

	const count = isOnline ? existingImages.length : selections.length;
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
		});
		await attachInOrder(rest);
	};

	const attachOnline = async (files: File[]) => {
		try {
			await attachInOrder(files);
		} catch (error) {
			showFailure(error);
		} finally {
			invalidateCaches();
		}
	};

	const handleFiles = async (picked: File[]) => {
		setFailureMessage('');
		const room = maxImages - count;
		setLimitNotice(picked.length > room);
		const accepted = picked.slice(0, Math.max(room, 0));
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
			});
		});
	};

	const handleMove = async (from: number, to: number) => {
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
			});
		});
	};

	const cards = isOnline
		? existingImages.map((image) => ({
				key: image.id ?? image.url,
				url: image.url,
				file: null,
				altText:
					(image.id ? altDrafts[image.id] : undefined) ?? image.altText ?? '',
			}))
		: selections.map((selection) => ({
				key: selection.id,
				url: null,
				file: selection.file,
				altText: selection.altText,
			}));

	const inputId = `post-image-input-${postId ?? 'new'}`;
	const addDisabled = isControlDisabled || isFull;

	return (
		<div className="space-y-2">
			<Label>{t('posts:images-label')}</Label>
			{cards.length > 0 ? (
				<ul className="space-y-2">
					{cards.map((card, index) => (
						<PostImageCard
							key={card.key}
							index={index}
							count={cards.length}
							url={card.url}
							file={card.file}
							altText={card.altText}
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
			<div className="flex items-center gap-3 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-dashed border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-3">
				<span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-(--publy-surface-raised) text-muted-foreground">
					<IconPhotoPlus aria-hidden="true" className="size-5" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<label
						htmlFor={inputId}
						className={cn(
							addDisabled
								? 'cursor-default text-muted-foreground'
								: 'cursor-pointer font-medium underline underline-offset-2',
						)}
					>
						{t('posts:image-add')}
					</label>
					{limits ? (
						<p className="publy-type-helper text-muted-foreground">
							{t('posts:image-help', {
								types: formatTypes(limits.acceptedImageContentTypes),
								size: formatBytes(limits.maxImageBytes),
								max: limits.maxImages,
							})}
						</p>
					) : null}
					{limits && (limitNotice || isFull) ? (
						<p
							className="publy-type-helper text-muted-foreground"
							data-testid="tenant-posts-create-image-limit"
						>
							{t('posts:image-limit-reached', { max: limits.maxImages })}
						</p>
					) : null}
					{failureMessage ? (
						<p
							className="publy-type-helper text-[var(--publy-danger)]"
							role="alert"
						>
							{failureMessage}
						</p>
					) : null}
				</div>
				<input
					id={inputId}
					type="file"
					multiple
					accept={
						limits?.acceptedImageContentTypes.join(',') ?? FALLBACK_ACCEPT_ATTR
					}
					disabled={addDisabled}
					className="sr-only"
					data-testid="tenant-posts-create-image-input"
					aria-label={t('posts:images-label')}
					onChange={(event) => {
						const picked = Array.from(event.target.files ?? []);
						event.target.value = '';
						if (picked.length > 0 && !addDisabled) {
							void handleFiles(picked);
						}
					}}
				/>
			</div>
		</div>
	);
};
