import { IconPhoto, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { resolveApiFileUrl } from '~/lib/api-client/resolve-api-file-url';
import {
	useAttachPostImageMutation,
	useRemovePostImageMutation,
	useUpdatePostImageAltMutation,
	useInvalidatePostImageCaches,
} from '~/lib/query/tenant-post-images';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

/** Mirrors the server's accepted image types — the server stays
 * authoritative and re-validates by magic-byte sniffing. */
const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,image/gif';

export type PostImagePickerExisting = {
	url: string;
	widthPx: number | null;
	heightPx: number | null;
	altText: string | null;
};

export type DeferredImageSelection = {
	file: File;
	altText: string;
};

/**
 * Single owner of a post's image concerns, with two modes:
 *
 * - Online (`postId` set): picks attach/remove against the API immediately
 *   and commits alt-text edits on blur through the post PATCH.
 * - Deferred (no `postId`, `onSelect` set — create drawer): collects the
 *   file locally; the parent attaches it right after the post exists, so
 *   the composer can offer an image before there is anything to attach to.
 *
 * Every server failure is surfaced inline through `getFailureMessage`
 * (never hand-translated at the call site).
 */
export const PostImagePicker = ({
	postId,
	existingImage = null,
	onSelect,
	disabled,
}: {
	postId?: string;
	existingImage?: PostImagePickerExisting | null;
	onSelect?: (selection: DeferredImageSelection | null) => void;
	disabled?: boolean;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const isOnline = Boolean(postId);
	const attachImage = useAttachPostImageMutation();
	const removeImage = useRemovePostImageMutation();
	const updateAlt = useUpdatePostImageAltMutation();
	const invalidateCaches = useInvalidatePostImageCaches();

	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
	const [pendingSelection, setPendingSelection] =
		useState<DeferredImageSelection | null>(null);
	const [altDraft, setAltDraft] = useState('');
	const [altOverride, setAltOverride] = useState<string | null>(null);
	const [failureMessage, setFailureMessage] = useState('');
	const previewRef = useRef<string | null>(null);

	// Revoke object URLs when replaced or unmounted so blobs don't leak.
	useEffect(() => {
		return () => {
			if (previewRef.current) {
				URL.revokeObjectURL(previewRef.current);
			}
		};
	}, []);

	const setPreview = (blob: Blob | null) => {
		if (previewRef.current) {
			URL.revokeObjectURL(previewRef.current);
			previewRef.current = null;
		}
		if (blob) {
			const objectUrl = URL.createObjectURL(blob);
			previewRef.current = objectUrl;
			setLocalPreviewUrl(objectUrl);
		} else {
			setLocalPreviewUrl(null);
		}
	};

	const showFailure = (error: unknown) => {
		setFailureMessage(
			getFailureMessage(toApiFailure(error), {
				fallback: t('common:an-error-occurred'),
			}) ?? '',
		);
	};

	const isBusy =
		attachImage.isPending || removeImage.isPending || updateAlt.isPending;
	const isControlDisabled = Boolean(disabled) || isBusy;

	const handleFile = async (file: File) => {
		setFailureMessage('');

		if (!isOnline) {
			const next: DeferredImageSelection = {
				file,
				altText: altDraft.trim(),
			};
			setPendingSelection(next);
			setPreview(file);
			onSelect?.(next);
			return;
		}

		try {
			await attachImage.mutateAsync({ postId: postId as string, file });
			invalidateCaches();
			setPreview(file);
		} catch (error) {
			showFailure(error);
		}
	};

	const handleRemove = async () => {
		setFailureMessage('');

		if (!isOnline) {
			setPendingSelection(null);
			setPreview(null);
			onSelect?.(null);
			return;
		}

		try {
			await removeImage.mutateAsync({ postId: postId as string });
			invalidateCaches();
			setPreview(null);
			setAltOverride(null);
		} catch (error) {
			showFailure(error);
		}
	};

	const commitAlt = async () => {
		if (!isOnline) {
			return;
		}
		// The API rejects alt-text edits without an attached image.
		if (!existingImage && !localPreviewUrl) {
			return;
		}

		const next = altOverride?.trim();
		if (!next) {
			return;
		}
		const previous = existingImage?.altText ?? '';
		if (next === previous) {
			return;
		}

		setFailureMessage('');
		try {
			await updateAlt.mutateAsync({
				postId: postId as string,
				altText: next,
			});
			invalidateCaches();
		} catch (error) {
			showFailure(error);
		}
	};

	const handleAltChange = (value: string) => {
		if (isOnline) {
			setAltOverride(value);
			return;
		}

		setAltDraft(value);
		if (pendingSelection) {
			const next = { ...pendingSelection, altText: value.trim() };
			setPendingSelection(next);
			onSelect?.(next);
		}
	};

	const previewSrc =
		localPreviewUrl ??
		(existingImage ? resolveApiFileUrl(existingImage.url) : null);
	const altValue = isOnline
		? (altOverride ?? existingImage?.altText ?? '')
		: altDraft;
	// Server-side, alt text only exists on an attached image.
	const canEditAlt =
		!isOnline || Boolean(existingImage) || Boolean(localPreviewUrl);

	return (
		<div className="space-y-1.5">
			<Label>{t('posts:image-label')}</Label>
			<div className="flex items-center gap-3 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-dashed border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-3">
				{previewSrc !== null ? (
					<img
						src={previewSrc}
						alt={existingImage?.altText ?? t('posts:image-label')}
						data-testid="tenant-posts-create-image-preview"
						className="max-h-16 max-w-32 rounded-[10px] object-contain"
					/>
				) : (
					<span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-(--publy-surface-raised) text-muted-foreground">
						<IconPhoto aria-hidden="true" className="size-5" />
					</span>
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<label
						htmlFor={`post-image-input-${postId ?? 'new'}`}
						className={
							isControlDisabled
								? 'cursor-default text-muted-foreground'
								: 'cursor-pointer font-medium underline underline-offset-2'
						}
					>
						{t('posts:image-help')}
					</label>
					{failureMessage ? (
						<p
							className="publy-type-helper text-[var(--publy-danger)]"
							role="alert"
						>
							{failureMessage}
						</p>
					) : null}
				</div>
				{previewSrc !== null ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={isControlDisabled}
						data-testid="tenant-posts-create-image-remove"
						onClick={() => void handleRemove()}
					>
						<IconX aria-hidden="true" className="size-3.5" />
						{t('posts:image-remove')}
					</Button>
				) : null}
				<input
					id={`post-image-input-${postId ?? 'new'}`}
					type="file"
					accept={ACCEPT_ATTR}
					disabled={isControlDisabled}
					className="sr-only"
					data-testid="tenant-posts-create-image-input"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file && !isControlDisabled) {
							void handleFile(file);
						}
					}}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor={`post-image-alt-${postId ?? 'new'}`}>
					{t('posts:image-alt-label')}
				</Label>
				<Input
					id={`post-image-alt-${postId ?? 'new'}`}
					value={altValue}
					placeholder={t('posts:image-alt-placeholder')}
					disabled={isControlDisabled || !canEditAlt}
					data-testid="tenant-posts-create-image-alt"
					onChange={(event) => handleAltChange(event.target.value)}
					onBlur={() => void commitAlt()}
				/>
			</div>
		</div>
	);
};
