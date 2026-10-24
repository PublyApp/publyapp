import type { TenantPostImage } from '~/lib/query/tenant-post-images';

import { ComposerDestinations } from './_composer-destinations';
import { toComposerImages } from './_composer-images';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

/** The edit page's destinations: the chips with their per-destination tabs
 * (what the next publish or schedule sends). */
export const PostEditDestinations = ({
	selection,
	destinationOverrides,
	body,
	segments,
	images,
}: {
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	body: string;
	segments: readonly SegmentDraft[];
	images: TenantPostImage[];
}) => {
	const composerImages = toComposerImages(images);

	return (
		<ComposerDestinations
			selection={selection}
			destinationOverrides={destinationOverrides}
			body={body}
			segments={segments}
			images={composerImages}
		/>
	);
};
