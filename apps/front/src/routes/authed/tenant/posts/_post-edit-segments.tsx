import { imagesOfSegment } from './_deferred-images';
import { PostSegmentsEditor } from './_post-segments-editor';
import type { PostSegmentsEditorProps } from './_post-segments-editor';
import type { SegmentDraft } from './_segment-draft';
import {
	DeferredSegmentImages,
	StoredSegmentImages,
	UnsavedSegmentImagesFailure,
} from './_segment-images';
import { storedFor } from './_stored-segments';
import type { StoredSegments } from './_stored-segments';
import type { EditSegmentImagesState } from './_use-edit-segment-images';
import type { ImageLimits } from './_use-publish-selection';

/** One follow-up's images: the stored ones, or (a follow-up added in this
 * session) the files picked for it, which save the post and attach. */
const EditSegmentImages = ({
	postId,
	tenantId,
	segment,
	number,
	stored,
	limits,
	isLocked,
	unsaved,
}: {
	postId: string;
	tenantId: string;
	segment: SegmentDraft;
	number: number;
	stored: StoredSegments;
	limits: ImageLimits | null;
	isLocked: boolean;
	unsaved: EditSegmentImagesState;
}) => {
	const isQueued = unsaved.queued.some(
		(image) => image.segmentKey === segment.id,
	);
	const attachedIds = new Set(
		unsaved.queued.flatMap((image) =>
			image.attachedAssetId === undefined ? [] : [image.attachedAssetId],
		),
	);
	return (
		<>
			{segment.serverId === undefined || isQueued ? null : (
				<StoredSegmentImages
					postId={postId}
					tenantId={tenantId}
					segmentId={segment.serverId}
					number={number}
					images={storedFor(stored, segment)?.images ?? []}
					limits={limits}
					disabled={isLocked || unsaved.isWorking}
				/>
			)}
			{isQueued || segment.serverId === undefined ? (
				<>
					<DeferredSegmentImages
						segmentKey={segment.id}
						number={number}
						all={unsaved.queued}
						onChange={(next) =>
							unsaved.onPick(segment.id, imagesOfSegment(next, segment.id))
						}
						limits={limits}
						disabled={unsaved.isWorking}
						storedImages={
							segment.serverId === undefined
								? []
								: // An image attached whose alt step failed is still queued:
									// it is shown once, as the queued card.
									(storedFor(stored, segment)?.images ?? []).filter(
										(image) => !attachedIds.has(image.id ?? ''),
									)
						}
					/>
					{isQueued && !unsaved.isWorking ? (
						<UnsavedSegmentImagesFailure
							cause={unsaved.error}
							onRetry={unsaved.retry}
						/>
					) : null}
				</>
			) : null}
		</>
	);
};

/** The edit page's thread follow-ups, each with the images stored on its
 * segment (0-4, #2181). */
export const PostEditSegments = ({
	postId,
	tenantId,
	stored,
	imageLimits,
	unsavedImages,
	...editor
}: PostSegmentsEditorProps & {
	postId: string;
	tenantId: string;
	stored: StoredSegments;
	imageLimits: ImageLimits | null;
	unsavedImages: EditSegmentImagesState;
}) => (
	<PostSegmentsEditor
		{...editor}
		isDisabled={unsavedImages.isWorking}
		renderImages={(segment, number) => (
			<EditSegmentImages
				postId={postId}
				tenantId={tenantId}
				segment={segment}
				number={number}
				stored={stored}
				limits={imageLimits}
				isLocked={number <= editor.publishedSegmentCount}
				unsaved={unsavedImages}
			/>
		)}
	/>
);
