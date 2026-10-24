import { NO_OVERRIDE } from '~/lib/publishing/destination-overrides';

import { DestinationChips } from './_destination-chips';
import type { ComposerImage } from './_destination-media-field';
import { DestinationPanel } from './_destination-panel';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

/** The composer's destinations: the chips (select, "Customize", the dot on a
 * customized destination) and, under them, the open destination's tab. The
 * shared editor stays where it is, one for every destination. */
export const ComposerDestinations = ({
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
	images: readonly ComposerImage[];
}) => {
	const { overrides, activeId } = destinationOverrides;
	// A deselected destination publishes nothing: its tab closes with it.
	const active = selection.selectedIds.includes(activeId ?? '')
		? selection.targets.find((target) => target.id === activeId)
		: undefined;

	return (
		<div className="space-y-3" data-testid="tenant-posts-composer-destinations">
			<DestinationChips
				selection={selection}
				overrides={destinationOverrides}
			/>
			{active ? (
				<DestinationPanel
					key={active.id}
					panelId={`destination-${active.id}`}
					label={active.label ?? active.provider}
					destination={
						selection.destinations.find(({ id }) => id === active.id) ?? null
					}
					override={overrides[active.id] ?? NO_OVERRIDE}
					body={body}
					segments={segments}
					images={images}
					maxImages={active.limits?.maxImages ?? null}
					onChange={(next) => destinationOverrides.update(active.id, next)}
					onReset={() => destinationOverrides.reset(active.id)}
					onDone={destinationOverrides.close}
				/>
			) : null}
		</div>
	);
};
