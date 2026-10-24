import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	BODY_KEY,
	isCustomized,
	withMedia,
	withText,
	withoutText,
} from '~/lib/publishing/destination-overrides';
import type { DestinationOverride } from '~/lib/publishing/destination-overrides';

import { DestinationMediaField } from './_destination-media-field';
import type { ComposerImage } from './_destination-media-field';
import { DestinationTextField } from './_destination-text-field';
import type { SegmentDraft } from './_segment-draft';
import type { SelectedDestination } from './_use-publish-selection';

type TextFieldsProps = {
	panelId: string;
	override: DestinationOverride;
	body: string;
	segments: readonly SegmentDraft[];
	destination: SelectedDestination | null;
	onChange: (next: DestinationOverride) => void;
};

/** The first segment, then one field per thread follow-up. */
const DestinationTextFields = ({
	panelId,
	override,
	body,
	segments,
	destination,
	onChange,
}: TextFieldsProps) => {
	const { t } = useTranslation(['posts']);
	const total = segments.length + 1;
	const fields = [
		{ key: BODY_KEY, text: body },
		...segments.map((segment) => ({ key: segment.id, text: segment.text })),
	];

	return fields.map((field, position) => (
		<DestinationTextField
			key={field.key}
			fieldId={`${panelId}-text-${field.key}`}
			label={
				total === 1
					? t('posts:destination-text-label')
					: t('posts:segment-number', { index: position + 1, total })
			}
			inherited={field.text}
			value={override.texts[field.key]}
			destination={destination}
			onChange={(next) =>
				onChange(
					next === undefined
						? withoutText(override, field.key)
						: withText(override, field.key, next),
				)
			}
		/>
	));
};

/** One destination's tab: the shared content, inherited, with an override
 * toggle per field (text per segment, images with order and alt text) and
 * "Reset to shared". Only what is toggled on is customized; the rest follows
 * the shared editor. */
export const DestinationPanel = ({
	panelId,
	label,
	destination,
	override,
	body,
	segments,
	images,
	maxImages,
	onChange,
	onReset,
	onDone,
	children,
}: {
	panelId: string;
	label: string;
	/** Null when the server advertised no limits for the destination. */
	destination: SelectedDestination | null;
	override: DestinationOverride;
	body: string;
	segments: readonly SegmentDraft[];
	images: readonly ComposerImage[];
	maxImages: number | null;
	onChange: (next: DestinationOverride) => void;
	onReset: () => void;
	/** Closes the tab and returns to the shared editor; omitted where the tab
	 * is the whole surface. */
	onDone?: () => void;
	/** Footer actions owned by the host (e.g. saving a scheduled rendition). */
	children?: ReactNode;
}) => {
	const { t } = useTranslation(['posts']);

	return (
		<section
			className="space-y-4 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) p-4"
			aria-labelledby={`${panelId}-title`}
			data-testid="tenant-posts-destination-panel"
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<h3 id={`${panelId}-title`} className="text-sm font-semibold">
						{t('posts:destination-panel-title', { destination: label })}
					</h3>
					<p className="publy-type-helper text-muted-foreground">
						{t('posts:destination-panel-description')}
					</p>
				</div>
				<div className="flex shrink-0 gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!isCustomized(override)}
						data-testid="tenant-posts-destination-reset"
						onClick={onReset}
					>
						{t('posts:destination-reset')}
					</Button>
					{onDone ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-testid="tenant-posts-destination-done"
							onClick={onDone}
						>
							{t('posts:destination-done')}
						</Button>
					) : null}
				</div>
			</div>
			<DestinationTextFields
				panelId={panelId}
				override={override}
				body={body}
				segments={segments}
				destination={destination}
				onChange={onChange}
			/>
			<DestinationMediaField
				images={images}
				value={override.media}
				maxImages={maxImages}
				onChange={(media) => onChange(withMedia(override, media))}
			/>
			{children}
		</section>
	);
};
