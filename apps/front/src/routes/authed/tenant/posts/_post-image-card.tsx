import {
	IconArrowDown,
	IconArrowUp,
	IconPhoto,
	IconX,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

/** Blob preview for a not-yet-uploaded file. One effect owns create/revoke so
 * every object URL dies with the card (or is replaced), never leaking. */
export const useFilePreview = (file: File | null): string | null => {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) {
			setObjectUrl(null);
			return;
		}

		const url = URL.createObjectURL(file);
		setObjectUrl(url);

		return () => {
			URL.revokeObjectURL(url);
		};
	}, [file]);

	return objectUrl;
};

export type PostImageCardProps = {
	/** 0-based position; shown 1-based. */
	index: number;
	/** Keeps the alt field id unique when several pickers share the page. */
	idPrefix?: string;
	count: number;
	/** Server url of an attached image (online mode). */
	url: string | null;
	/** Local file not uploaded yet (deferred mode). */
	file: File | null;
	altText: string;
	disabled: boolean;
	/** Position of the first card that can move earlier (cards before it are
	 * read-only ones); default 0. */
	firstMovableIndex?: number;
	/** A read-only card: no alt-text nudge it cannot act on. */
	isLocked?: boolean;
	/** Why this image cannot be published as it is (e.g. it is above a selected
	 * destination's size cap); empty = none. */
	error?: string;
	onAltChange: (value: string) => void;
	onAltCommit: () => void;
	onMoveEarlier: () => void;
	onMoveLater: () => void;
	onRemove: () => void;
};

/** One image of the post: preview, alt text with a gentle nudge (never a
 * block), reorder and remove. */
export const PostImageCard = ({
	index,
	idPrefix = 'post-image',
	count,
	url,
	file,
	altText,
	disabled,
	firstMovableIndex = 0,
	isLocked = false,
	error = '',
	onAltChange,
	onAltCommit,
	onMoveEarlier,
	onMoveLater,
	onRemove,
}: PostImageCardProps) => {
	const { t } = useTranslation(['posts']);
	const localPreview = useFilePreview(file);
	const previewSrc = localPreview ?? url;
	const number = index + 1;
	const altId = `${idPrefix}-alt-${index}`;

	return (
		<li
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) p-3"
			data-testid="tenant-posts-create-image-card"
		>
			<div className="flex items-start gap-3">
				{previewSrc !== null ? (
					<img
						src={previewSrc}
						alt={altText || t('posts:image-card-label', { index: number })}
						data-testid="tenant-posts-create-image-preview"
						className="max-h-20 max-w-32 rounded-[10px] object-contain"
					/>
				) : (
					<span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-(--publy-surface-raised) text-muted-foreground">
						<IconPhoto aria-hidden="true" className="size-5" />
					</span>
				)}
				<div className="ml-auto flex shrink-0 gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={disabled || index <= firstMovableIndex}
						aria-label={t('posts:image-move-earlier', { index: number })}
						data-testid="tenant-posts-create-image-move-earlier"
						onClick={onMoveEarlier}
					>
						<IconArrowUp aria-hidden="true" className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={disabled || index === count - 1}
						aria-label={t('posts:image-move-later', { index: number })}
						data-testid="tenant-posts-create-image-move-later"
						onClick={onMoveLater}
					>
						<IconArrowDown aria-hidden="true" className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={disabled}
						aria-label={t('posts:image-remove-numbered', { index: number })}
						data-testid="tenant-posts-create-image-remove"
						onClick={onRemove}
					>
						<IconX aria-hidden="true" className="size-4" />
					</Button>
				</div>
			</div>
			<div className="space-y-1">
				<Label htmlFor={altId}>
					{t('posts:image-alt-label-numbered', { index: number })}
				</Label>
				<Input
					id={altId}
					value={altText}
					placeholder={t('posts:image-alt-placeholder')}
					disabled={disabled}
					data-testid="tenant-posts-create-image-alt"
					onChange={(event) => onAltChange(event.target.value)}
					onBlur={onAltCommit}
					onKeyDown={(event) => {
						// Inside a form, Enter would save the whole post: it commits
						// the alt text instead.
						if (event.key === 'Enter') {
							event.preventDefault();
							onAltCommit();
						}
					}}
				/>
				{error === '' ? null : (
					<p
						className="publy-type-helper text-[var(--publy-danger)]"
						role="alert"
						data-testid="tenant-posts-create-image-error"
					>
						{error}
					</p>
				)}
				{altText.trim() === '' && !isLocked ? (
					<p
						className="publy-type-helper text-muted-foreground"
						data-testid="tenant-posts-create-image-alt-nudge"
					>
						{t('posts:image-alt-nudge')}
					</p>
				) : null}
			</div>
		</li>
	);
};

const noop = () => undefined;

/** Images already stored that this list cannot change: the same cards, with
 * every control off. */
export const LockedImageCards = ({
	images,
	idPrefix,
	total,
}: {
	images: readonly {
		id?: string | null;
		url: string;
		altText: string | null;
	}[];
	idPrefix: string;
	total: number;
}) => (
	<>
		{images.map((image, index) => (
			<PostImageCard
				key={image.id ?? image.url}
				index={index}
				idPrefix={idPrefix}
				count={total}
				url={image.url}
				file={null}
				altText={image.altText ?? ''}
				disabled
				isLocked
				onAltChange={noop}
				onAltCommit={noop}
				onMoveEarlier={noop}
				onMoveLater={noop}
				onRemove={noop}
			/>
		))}
	</>
);
