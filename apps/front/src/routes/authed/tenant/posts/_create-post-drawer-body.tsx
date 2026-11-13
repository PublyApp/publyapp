import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';

import type { FindProjectsForTenantResponse } from '@org/client-ts/models/index';

import { ComposerDestinations } from './_composer-destinations';
import { ComposerThreadPreview } from './_composer-thread-preview';
import { HandoffPanel } from './_create-post-drawer-parts';
import {
	imagesOfSegment,
	postImages,
	withPostImages,
} from './_deferred-images';
import { PostBodyCounter } from './_post-body-counter';
import { PostImagePicker } from './_post-image-picker';
import type { DeferredImageSelection } from './_post-image-picker';
import { PostProjectField } from './_post-project-field';
import { PostSegmentsEditor } from './_post-segments-editor';
import type { SegmentDraft } from './_segment-draft';
import { DeferredSegmentImages } from './_segment-images';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

const toPreview = (image: DeferredImageSelection) => ({
	key: image.id,
	url: null,
	file: image.file,
	altText: image.altText,
});

/** What the composer fields need from the drawer. */
export type CreatePostFieldsProps = {
	body: string;
	segments: SegmentDraft[];
	onSegmentsChange: (next: SegmentDraft[]) => void;
	/** Field errors by follow-up position, from the form. */
	segmentErrors: readonly (string | undefined)[];
	rootError: string | undefined;
	projectsQuery: UseQueryResult<FindProjectsForTenantResponse, Error>;
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	deferredImages: DeferredImageSelection[];
	onSelectImages: (selections: DeferredImageSelection[]) => void;
	/** A save or publish is in flight: nothing can be typed or picked, or it
	 * would be overwritten when the request ends. */
	isBusy: boolean;
	/** Set while the post exists but its images did not attach. */
	handoff: {
		cause: string;
		segmentNumber?: number;
		busy: boolean;
		onRetry: () => void;
		onDiscard: () => void;
	} | null;
};

/** The create drawer's form fields: text, thread, project, images (or the
 * handoff panel) and the destinations block. */
export const CreatePostFields = ({
	body,
	segments,
	onSegmentsChange,
	segmentErrors,
	rootError,
	projectsQuery,
	selection,
	destinationOverrides,
	deferredImages,
	onSelectImages,
	isBusy,
	handoff,
}: CreatePostFieldsProps) => {
	const { t } = useTranslation(['posts']);
	const ownImages = postImages(deferredImages);

	return (
		<>
			<Field.Textarea
				name="body"
				label={t('posts:body-label')}
				placeholder={t('posts:body-placeholder')}
				rows={8}
				readOnly={isBusy}
				aria-describedby="post-body-counter"
				data-testid="tenant-posts-create-body"
			/>
			<PostBodyCounter length={body.length} id="post-body-counter" />
			<PostSegmentsEditor
				segments={segments}
				publishedSegmentCount={0}
				destinations={selection.destinations}
				overrides={destinationOverrides.overrides}
				isDisabled={isBusy}
				onChange={onSegmentsChange}
				errors={segmentErrors}
				renderImages={(segment, number) => (
					<DeferredSegmentImages
						segmentKey={segment.id}
						number={number}
						all={deferredImages}
						onChange={onSelectImages}
						limits={selection.imageLimits}
						disabled={handoff !== null || isBusy}
					/>
				)}
			/>
			{rootError ? (
				<p className="text-sm text-destructive" role="alert">
					{rootError}
				</p>
			) : null}
			<PostProjectField projectsQuery={projectsQuery} />
			{handoff ? (
				<HandoffPanel
					cause={handoff.cause}
					segmentNumber={handoff.segmentNumber}
					busy={handoff.busy}
					onRetry={handoff.onRetry}
					onDiscard={handoff.onDiscard}
				/>
			) : (
				<PostImagePicker
					onSelect={(next) =>
						onSelectImages(withPostImages(deferredImages, next))
					}
					selections={ownImages}
					limits={selection.imageLimits}
					disabled={isBusy}
				/>
			)}
			<ComposerDestinations
				selection={selection}
				destinationOverrides={destinationOverrides}
				body={body}
				segments={segments}
				images={ownImages.map((image) => ({
					key: image.id,
					url: null,
					altText: image.altText,
				}))}
			/>
			<ComposerThreadPreview
				body={body}
				segments={segments}
				bodyImages={ownImages.map(toPreview)}
				imagesOfSegment={(segment) =>
					imagesOfSegment(deferredImages, segment.id).map(toPreview)
				}
				overrides={destinationOverrides.overrides}
				destinations={selection.destinations}
			/>
		</>
	);
};
