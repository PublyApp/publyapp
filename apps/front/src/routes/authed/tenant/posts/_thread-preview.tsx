import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

import { useFilePreview } from './_post-image-card';
import type {
	PreviewImage,
	PreviewSegment,
	PreviewVariant,
} from './_thread-preview-model';

const PreviewThumb = ({ image }: { image: PreviewImage }) => {
	const local = useFilePreview(image.file);
	const src = local ?? image.url;

	if (src === null) {
		return null;
	}
	return (
		<img
			src={src}
			alt={image.altText}
			data-testid="tenant-posts-thread-preview-image"
			className="max-h-20 max-w-32 rounded-[10px] object-contain"
		/>
	);
};

const PreviewItem = ({
	segment,
	total,
}: {
	segment: PreviewSegment;
	total: number;
}) => {
	const { t } = useTranslation(['posts']);

	return (
		<li
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) p-3"
			data-testid="tenant-posts-thread-preview-segment"
		>
			<p className="publy-type-helper text-muted-foreground">
				{t('posts:segment-number', { index: segment.number, total })}
			</p>
			<p
				className={cn(
					'whitespace-pre-wrap break-words',
					segment.textState === 'error' && 'text-[var(--publy-danger)]',
				)}
				data-testid="tenant-posts-thread-preview-text"
				data-state={segment.textState}
			>
				{segment.text}
			</p>
			{segment.images.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{segment.images.map((image) => (
						<PreviewThumb key={image.key} image={image} />
					))}
				</div>
			) : null}
			{segment.droppedImages > 0 ? (
				<p
					className="publy-type-helper text-[var(--publy-danger)]"
					data-testid="tenant-posts-thread-preview-dropped"
				>
					{t('posts:thread-preview-images-dropped', {
						count: segment.droppedImages,
					})}
				</p>
			) : null}
		</li>
	);
};

const variantTitle = (
	variant: PreviewVariant,
	variantCount: number,
	t: (key: string) => string,
): string => {
	if (variant.destinations.length === 0) {
		return t('posts:thread-preview-shared');
	}
	if (variantCount === 1 && variant.destinations.length > 1) {
		return t('posts:thread-preview-all');
	}
	return variant.destinations.join(', ');
};

/** The thread as it will publish, read-only: segment order, text and images
 * of each segment. One block per group of destinations that get the exact
 * same thread, so it splits only where limits or customizations differ. */
export const ThreadPreview = ({
	variants,
}: {
	variants: readonly PreviewVariant[];
}) => {
	const { t } = useTranslation(['posts']);

	return (
		<section className="space-y-3" data-testid="tenant-posts-thread-preview">
			<h3 className="text-[13px] font-medium text-foreground">
				{t('posts:thread-preview-title')}
			</h3>
			{variants.map((variant) => (
				<div
					key={variant.destinationIds.join('|')}
					className="space-y-2"
					data-testid="tenant-posts-thread-preview-variant"
				>
					<p className="publy-type-helper text-muted-foreground">
						{variantTitle(variant, variants.length, t)}
					</p>
					<ol className="space-y-2">
						{variant.segments.map((segment) => (
							<PreviewItem
								key={segment.number}
								segment={segment}
								total={variant.segments.length}
							/>
						))}
					</ol>
				</div>
			))}
		</section>
	);
};
