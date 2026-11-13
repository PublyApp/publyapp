import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import type { TenantPostImage } from '~/lib/query/tenant-post-images';
import { cn } from '~/lib/utils';

import { imagesOfSegment, withSegmentImages } from './_deferred-images';
import { PostImagePicker } from './_post-image-picker';
import type { DeferredImageSelection } from './_post-image-picker';
import {
	MAX_SEGMENT_IMAGES,
	segmentImageLimits,
} from './_segment-image-limits';
import type { ImageLimits } from './_use-publish-selection';

/** "2/4 images": the segment's images against the tightest cap of the
 * SELECTED destinations (red above it, e.g. after a stricter destination was
 * selected). */
const SegmentImageCount = ({
	count,
	limits,
}: {
	count: number;
	limits: ImageLimits | null;
}) => {
	const { t } = useTranslation(['posts']);
	const max = limits?.maxImages ?? MAX_SEGMENT_IMAGES;

	return (
		<p
			className={cn(
				'publy-type-helper',
				count > max ? 'text-[var(--publy-danger)]' : 'text-muted-foreground',
			)}
			data-testid="tenant-posts-segment-image-count"
		>
			{t('posts:segment-image-count', { count, max })}
		</p>
	);
};

const NO_STORED_IMAGES: readonly TenantPostImage[] = [];

/** Create drawer: the follow-up's images are picked now and attached once the
 * post exists. `all` is the drawer's one list of picked images; this edits
 * only the slice of this segment. */
export const DeferredSegmentImages = ({
	segmentKey,
	number,
	all,
	onChange,
	limits,
	disabled,
	storedImages = NO_STORED_IMAGES,
}: {
	segmentKey: string;
	/** The segment number (2..N), for the field's accessible name. */
	number: number;
	all: readonly DeferredImageSelection[];
	onChange: (next: DeferredImageSelection[]) => void;
	limits: ImageLimits | null;
	disabled?: boolean;
	/** Images already stored on this follow-up (a partial attach): shown
	 * read-only and counted against the cap, so the queue never exceeds it. */
	storedImages?: readonly TenantPostImage[];
}) => {
	const { t } = useTranslation(['posts']);
	const own = imagesOfSegment(all, segmentKey);
	const capped = segmentImageLimits(limits);
	const stored = storedImages.length;

	return (
		<PostImagePicker
			idKey={`segment-${segmentKey}`}
			label={t('posts:segment-images-label', { index: number })}
			header={<SegmentImageCount count={stored + own.length} limits={capped} />}
			selections={own}
			lockedImages={storedImages}
			onSelect={(next) => onChange(withSegmentImages(all, segmentKey, next))}
			limits={capped}
			hardMax={MAX_SEGMENT_IMAGES}
			disabled={disabled}
		/>
	);
};

/** Edit page: the follow-up's stored images, managed against the API. */
export const StoredSegmentImages = ({
	postId,
	tenantId,
	segmentId,
	number,
	images,
	limits,
	disabled,
}: {
	postId: string;
	tenantId: string;
	segmentId: string;
	number: number;
	images: TenantPostImage[];
	limits: ImageLimits | null;
	disabled?: boolean;
}) => {
	const { t } = useTranslation(['posts']);
	const capped = segmentImageLimits(limits);

	return (
		<PostImagePicker
			postId={postId}
			tenantId={tenantId}
			segmentId={segmentId}
			label={t('posts:segment-images-label', { index: number })}
			header={<SegmentImageCount count={images.length} limits={capped} />}
			existingImages={images}
			limits={capped}
			hardMax={MAX_SEGMENT_IMAGES}
			disabled={disabled}
		/>
	);
};

/** Why the save-and-attach of a new follow-up's images stopped (no cause once
 * the notice was dismissed), with the way to finish it: the picked files stay
 * queued, so "Try again" stays too. */
export const UnsavedSegmentImagesFailure = ({
	cause,
	onRetry,
}: {
	cause: string;
	onRetry: () => void;
}) => {
	const { t } = useTranslation(['posts']);

	return (
		<div
			className="space-y-2"
			data-testid="tenant-posts-segment-images-failure"
		>
			{cause === '' ? null : (
				<p
					className="publy-type-helper text-[var(--publy-danger)]"
					role="alert"
				>
					{cause}
				</p>
			)}
			<Button
				type="button"
				variant="outline"
				size="sm"
				data-testid="tenant-posts-segment-images-retry"
				onClick={onRetry}
			>
				{t('posts:image-retry')}
			</Button>
		</div>
	);
};
