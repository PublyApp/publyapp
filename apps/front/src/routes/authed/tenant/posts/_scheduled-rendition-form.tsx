import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	BODY_KEY,
	NO_OVERRIDE,
	fromRenditionOverrides,
	isCustomized,
	toWireOverrides,
} from '~/lib/publishing/destination-overrides';
import type { DestinationOverride } from '~/lib/publishing/destination-overrides';
import {
	useResetPublicationRenditionMutation,
	useSavePublicationRenditionMutation,
} from '~/lib/query/tenant-publication-renditions';
import type { TenantPublicationRendition } from '~/lib/query/tenant-publication-renditions';
import type { TenantPublishTarget } from '~/lib/query/tenant-publish-targets';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { ComposerImage } from './_destination-media-field';
import { DestinationPanel } from './_destination-panel';
import { findPublishProblems } from './_publish-validation';
import type { SegmentDraft } from './_segment-draft';

/** A scheduled destination's tab: the same inherited-content view as the
 * composer, saved explicitly with PUT (no autosave) and reset with DELETE.
 * A published, replaced or in-flight publication answers 409 (locked, needs
 * review, superseded, in progress, conflict) and a bad override 422 naming the
 * destination: both surface inline through `getFailureMessage`. */
export const ScheduledRenditionForm = ({
	row,
	tenantId,
	rendition,
	target,
	body,
	segments,
	images,
	isPostDirty,
	onClose,
}: {
	row: ScheduledPublicationRow;
	tenantId: string;
	rendition: TenantPublicationRendition;
	/** The account's publish target, for its limits; undefined when it is not
	 * visible in the project any more. */
	target: TenantPublishTarget | undefined;
	body: string;
	segments: readonly SegmentDraft[];
	images: readonly ComposerImage[];
	/** Unsaved edits to the shared post: the rendition is validated against
	 * the SAVED post, so saving is held until the post is saved. */
	isPostDirty: boolean;
	onClose: () => void;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const segmentKeys = [BODY_KEY, ...segments.map((segment) => segment.id)];
	const imageKeys = images.map((image) => image.key);
	const [draft, setDraft] = useState<DestinationOverride>(() =>
		fromRenditionOverrides(rendition.overrides, segmentKeys),
	);
	const [failureMessage, setFailureMessage] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<'saved' | 'reset' | null>(null);
	const save = useSavePublicationRenditionMutation();
	const reset = useResetPublicationRenditionMutation();
	const isBusy = save.isPending || reset.isPending;
	const label = row.accountDisplayHandle ?? target?.label ?? '';
	const destination =
		target?.limits && row.socialAccountId
			? {
					id: row.socialAccountId,
					label: label || target.provider,
					limits: target.limits,
				}
			: null;
	const problems = findPublishProblems({
		destinations: destination ? [destination] : [],
		overrides: destination ? { [destination.id]: draft } : {},
		body,
		segments,
		imageKeys,
	});
	const problem = problems.overrideProblem ?? null;

	const showFailure = (error: unknown) => {
		setFailureMessage(
			getFailureMessage(toApiFailure(error), {
				fallback: t('common:an-error-occurred'),
			}),
		);
	};

	const handleSave = async () => {
		setFailureMessage(null);
		setFeedback(null);
		try {
			await save.mutateAsync({
				tenantId,
				publicationId: row.publicationId,
				overrides: toWireOverrides(draft, segmentKeys, imageKeys),
			});
		} catch (error) {
			showFailure(error);
			return;
		}
		setFeedback(isCustomized(draft) ? 'saved' : 'reset');
	};

	const handleReset = async () => {
		setFailureMessage(null);
		setFeedback(null);
		try {
			await reset.mutateAsync({ tenantId, publicationId: row.publicationId });
		} catch (error) {
			showFailure(error);
			return;
		}
		setDraft(NO_OVERRIDE);
		setFeedback('reset');
	};

	return (
		<DestinationPanel
			panelId={`scheduled-${row.publicationId}`}
			label={label}
			destination={destination}
			override={draft}
			body={body}
			segments={segments}
			images={images}
			maxImages={target?.limits?.maxImages ?? null}
			onChange={(next) => {
				setFeedback(null);
				setDraft(next);
			}}
			onReset={() => void handleReset()}
			onDone={onClose}
		>
			{isPostDirty ? (
				<p
					className="publy-type-helper text-muted-foreground"
					data-testid="tenant-posts-rendition-save-post-first"
				>
					{t('posts:rendition-save-post-first')}
				</p>
			) : null}
			{problem ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-override-problem"
				>
					{t(
						problem.kind === 'blank'
							? 'posts:override-blank'
							: 'posts:override-over-limit',
						{ destination: problem.destination, index: problem.segmentNumber },
					)}
				</p>
			) : null}
			{failureMessage ? (
				<p
					className="text-sm text-destructive"
					role="alert"
					data-testid="tenant-posts-rendition-failure"
				>
					{failureMessage}
				</p>
			) : null}
			{feedback !== null ? (
				<p
					className="publy-type-helper text-muted-foreground"
					role="status"
					data-testid="tenant-posts-rendition-saved"
				>
					{feedback === 'saved'
						? t('posts:rendition-saved')
						: t('posts:rendition-saved-shared')}
				</p>
			) : null}
			<div>
				<Button
					type="button"
					variant="default"
					size="sm"
					disabled={isBusy || isPostDirty || problem !== null}
					data-testid="tenant-posts-rendition-save"
					onClick={() => void handleSave()}
				>
					{save.isPending ? t('posts:saving') : t('posts:rendition-save')}
				</Button>
			</div>
		</DestinationPanel>
	);
};
