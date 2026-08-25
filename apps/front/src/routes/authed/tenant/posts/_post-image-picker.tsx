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

/**
 * Attach/remove flow for a post's single image. The alt text is typed before
 * picking the file and travels with the attach multipart body; on an already
 * attached image it is read-only here (the edit page owns alt editing via the
 * post PATCH).
 */
export const PostImagePicker = ({
	postId,
	existingImage,
	onRemoved,
	disabled,
}: {
	postId: string;
	existingImage: PostImagePickerExisting | null;
	onRemoved?: () => void;
	disabled?: boolean;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const attachImage = useAttachPostImageMutation();
	const removeImage = useRemovePostImageMutation();
	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
	const [altDraft, setAltDraft] = useState('');
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

	const isBusy = attachImage.isPending || removeImage.isPending;
	const isDisabled = Boolean(disabled) || isBusy;

	const showFailure = (error: unknown) => {
		setFailureMessage(
			getFailureMessage(toApiFailure(error), {
				fallback: t('common:an-error-occurred'),
			}) ?? '',
		);
	};

	const handleFile = async (file: File) => {
		setFailureMessage('');

		try {
			await attachImage.mutateAsync({
				postId,
				file,
				...(altDraft.trim() ? { altText: altDraft.trim() } : {}),
			});
			const objectUrl = URL.createObjectURL(file);
			previewRef.current = objectUrl;
			setLocalPreviewUrl(objectUrl);
			setAltDraft('');
		} catch (error) {
			showFailure(error);
		}
	};

	const handleRemove = async () => {
		setFailureMessage('');

		try {
			await removeImage.mutateAsync({ postId });
			if (previewRef.current) {
				URL.revokeObjectURL(previewRef.current);
				previewRef.current = null;
			}
			setLocalPreviewUrl(null);
			onRemoved?.();
		} catch (error) {
			showFailure(error);
		}
	};

	const previewSrc =
		localPreviewUrl ??
		(existingImage ? resolveApiFileUrl(existingImage.url) : null);

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
					<p className="text-[13px] text-foreground">
						<label
							htmlFor={`post-image-input-${postId}`}
							className={
								isDisabled
									? 'cursor-default'
									: 'cursor-pointer font-medium underline underline-offset-2'
							}
						>
							{t('posts:image-help')}
						</label>
					</p>
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
						disabled={isDisabled}
						data-testid="tenant-posts-create-image-remove"
						onClick={() => void handleRemove()}
					>
						<IconX aria-hidden="true" className="size-3.5" />
						{t('posts:image-remove')}
					</Button>
				) : null}
				<input
					id={`post-image-input-${postId}`}
					type="file"
					accept={ACCEPT_ATTR}
					disabled={isDisabled}
					className="sr-only"
					data-testid="tenant-posts-create-image-input"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file && !isDisabled) {
							void handleFile(file);
						}
					}}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor={`post-image-alt-${postId}`}>
					{t('posts:image-alt-label')}
				</Label>
				<Input
					id={`post-image-alt-${postId}`}
					value={existingImage?.altText ?? altDraft}
					readOnly={existingImage !== null}
					placeholder={t('posts:image-alt-placeholder')}
					disabled={isDisabled || existingImage !== null}
					data-testid="tenant-posts-create-image-alt"
					onChange={(event) => setAltDraft(event.target.value)}
				/>
			</div>
		</div>
	);
};
