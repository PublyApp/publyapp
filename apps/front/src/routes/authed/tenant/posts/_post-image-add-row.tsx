import { IconPhotoPlus } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '~/lib/format-bytes';
import { cn } from '~/lib/utils';

import type { ImageLimits } from './_use-publish-selection';

/** Image caps come from the selected destinations' advertised capability
 * (`GET /publishing/publish-targets`); the server stays authoritative and
 * re-validates by magic-byte sniffing and a typed 422 on the excess image.
 * With no destination selected there is nothing to cap against yet. */
const FALLBACK_ACCEPT_ATTR = 'image/*';

type AddRowProps = {
	inputId: string;
	/** Accessible name of the file input; defaults to the post's "Images". */
	label?: string;
	limits: ImageLimits | null;
	addDisabled: boolean;
	/** The notice lines under the label (limits, why adding is off, failure):
	 * composed by the picker, which owns that state. */
	children?: ReactNode;
	onPick: (files: File[]) => void;
};

const formatTypes = (types: string[]): string =>
	types.map((type) => type.replace('image/', '').toUpperCase()).join(', ');

/** The notice lines under the "Add images" label: the advertised limits, why
 * adding is off, and the last failure. `cap` is the cap in force; null = none. */
export const PostImageNotices = ({
	limits,
	cap,
	noCommonType,
	limitReached,
	full,
	failureMessage,
}: {
	limits: ImageLimits | null;
	cap: number | null;
	noCommonType: boolean;
	limitReached: boolean;
	full: boolean;
	failureMessage: string;
}) => {
	const { t, i18n } = useTranslation(['posts']);

	return (
		<>
			{noCommonType ? (
				<p
					className="publy-type-helper text-muted-foreground"
					data-testid="tenant-posts-create-image-no-common-type"
				>
					{t('posts:image-no-common-type')}
				</p>
			) : null}
			{limits && !noCommonType ? (
				<p className="publy-type-helper text-muted-foreground">
					{t('posts:image-help', {
						types: formatTypes(limits.acceptedImageContentTypes),
						size: formatBytes(limits.maxImageBytes, i18n.language, 'limit'),
						max: limits.maxImages,
					})}
				</p>
			) : null}
			{cap !== null && limitReached ? (
				<p
					className="publy-type-helper text-muted-foreground"
					data-testid="tenant-posts-create-image-limit"
				>
					{t('posts:image-limit-reached', { max: cap })}
				</p>
			) : null}
			{cap !== null && full && !limitReached ? (
				<p
					className="publy-type-helper text-muted-foreground"
					data-testid="tenant-posts-create-image-full"
				>
					{t('posts:image-full', { max: cap })}
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
		</>
	);
};

/** The dashed "Add images" row: the file input, the advertised limits, and why
 * adding is off (full, or no image type shared by the destinations). */
export const PostImageAddRow = ({
	inputId,
	label,
	limits,
	addDisabled,
	children,
	onPick,
}: AddRowProps) => {
	const { t } = useTranslation(['posts']);

	return (
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
				{children}
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
				aria-label={label ?? t('posts:images-label')}
				onChange={(event) => {
					const picked = Array.from(event.target.files ?? []);
					event.target.value = '';
					if (picked.length > 0 && !addDisabled) {
						onPick(picked);
					}
				}}
			/>
		</div>
	);
};
