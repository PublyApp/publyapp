import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';

import type { FindProjectsForTenantResponse } from '@org/client-ts/models/index';

import { ComposerDestinations } from './_composer-destinations';
import { HandoffPanel } from './_create-post-drawer-parts';
import { PostBodyCounter } from './_post-body-counter';
import { PostImagePicker } from './_post-image-picker';
import type { DeferredImageSelection } from './_post-image-picker';
import { PostProjectField } from './_post-project-field';
import { PostSegmentsEditor } from './_post-segments-editor';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

/** What the composer fields need from the drawer. */
export type CreatePostFieldsProps = {
	body: string;
	segments: SegmentDraft[];
	onSegmentsChange: (next: SegmentDraft[]) => void;
	rootError: string | undefined;
	projectsQuery: UseQueryResult<FindProjectsForTenantResponse, Error>;
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	deferredImages: DeferredImageSelection[];
	onSelectImages: (selections: DeferredImageSelection[]) => void;
	/** Set while the post exists but its images did not attach. */
	handoff: {
		cause: string;
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
	rootError,
	projectsQuery,
	selection,
	destinationOverrides,
	deferredImages,
	onSelectImages,
	handoff,
}: CreatePostFieldsProps) => {
	const { t } = useTranslation(['posts']);

	return (
		<>
			<Field.Textarea
				name="body"
				label={t('posts:body-label')}
				placeholder={t('posts:body-placeholder')}
				rows={8}
				aria-describedby="post-body-counter"
				data-testid="tenant-posts-create-body"
			/>
			<PostBodyCounter length={body.length} id="post-body-counter" />
			<PostSegmentsEditor
				segments={segments}
				publishedSegmentCount={0}
				destinations={selection.destinations}
				overrides={destinationOverrides.overrides}
				onChange={onSegmentsChange}
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
					busy={handoff.busy}
					onRetry={handoff.onRetry}
					onDiscard={handoff.onDiscard}
				/>
			) : (
				<PostImagePicker
					onSelect={onSelectImages}
					selections={deferredImages}
					limits={selection.imageLimits}
				/>
			)}
			<ComposerDestinations
				selection={selection}
				destinationOverrides={destinationOverrides}
				body={body}
				segments={segments}
				images={deferredImages.map((image) => ({
					key: image.id,
					url: null,
					altText: image.altText,
				}))}
			/>
		</>
	);
};
