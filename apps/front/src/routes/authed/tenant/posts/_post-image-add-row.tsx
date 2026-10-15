import { IconPhotoPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

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

type AddRowProps = {
	inputId: string;
	limits: ImageLimits | null;
	addDisabled: boolean;
	isFull: boolean;
	hasNoCommonType: boolean;
	showLimitNotice: boolean;
	failureMessage: string;
	onPick: (files: File[]) => void;
};

/** The dashed "Add images" row: the file input, the advertised limits, and why
 * adding is off (full, or no image type shared by the destinations). */
export const PostImageAddRow = ({
	inputId,
	limits,
	addDisabled,
	isFull,
	hasNoCommonType,
	showLimitNotice,
	failureMessage,
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
				{hasNoCommonType ? (
					<p
						className="publy-type-helper text-muted-foreground"
						data-testid="tenant-posts-create-image-no-common-type"
					>
						{t('posts:image-no-common-type')}
					</p>
				) : null}
				{limits && !hasNoCommonType ? (
					<p className="publy-type-helper text-muted-foreground">
						{t('posts:image-help', {
							types: formatTypes(limits.acceptedImageContentTypes),
							size: formatBytes(limits.maxImageBytes),
							max: limits.maxImages,
						})}
					</p>
				) : null}
				{limits && (showLimitNotice || isFull) ? (
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
						onPick(picked);
					}
				}}
			/>
		</div>
	);
};
