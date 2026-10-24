import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import {
	POSTS_PUBLISH,
	useTenantPermissions,
} from '~/lib/query/tenant-permissions';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import { TenantReadOnlyCardError } from '../_read-only-query-slots';
import type { ComposerImage } from './_destination-media-field';
import {
	ScheduledPublicationCustomized,
	ScheduledPublicationStatus,
	ScheduledPublicationTime,
} from './_scheduled-publication-display';
import { buildUpcomingPublicationWindow } from './_scheduled-publication-helpers';
import { ScheduledRenditionEditor } from './_scheduled-rendition-editor';
import type { SegmentDraft } from './_segment-draft';
import type { PublishSelection } from './_use-publish-selection';
import { useScheduledPublicationAllPages } from './_use-scheduled-publication-all-pages';

/** A destination can still be customized until it is published: scheduled,
 * paused and failed rows (a failed one is fixed by customizing, then retrying). */
const CUSTOMIZABLE_STATUSES = ['scheduled', 'paused', 'failed'];

const SCHEDULED_PAGE_SIZE = 100;

/** The destinations this post is already scheduled to (one row each, a
 * replaced publication left out): each can be customized after scheduling.
 * Hidden without `tenant.posts.publish` (the rendition PUT/DELETE require it)
 * and while the post has none; a failed load shows its failure instead of
 * silently hiding the block. */
export const ScheduledRenditionsBlock = ({
	postId,
	tenantId,
	selection,
	body,
	segments,
	images,
	isPostDirty,
}: {
	postId: string;
	tenantId: string;
	selection: PublishSelection;
	body: string;
	segments: readonly SegmentDraft[];
	images: readonly ComposerImage[];
	isPostDirty: boolean;
}) => {
	const { t } = useTranslation(['posts']);
	const { hasPermission } = useTenantPermissions(tenantId);
	const [scheduleWindow] = useState(() =>
		buildUpcomingPublicationWindow(new Date()),
	);
	const [openId, setOpenId] = useState<string | null>(null);
	const { rows, isAggregating, shouldLogout, error, restart } =
		useScheduledPublicationAllPages({
			tenantId,
			window: scheduleWindow,
			initialSize: SCHEDULED_PAGE_SIZE,
			statuses: CUSTOMIZABLE_STATUSES,
		});
	const own = rows.filter(
		(row: ScheduledPublicationRow) => row.postId === postId && !row.superseded,
	);

	if (!hasPermission(POSTS_PUBLISH)) {
		return null;
	}
	if (shouldLogout) {
		return <LogoutRedirect />;
	}
	if (error !== null) {
		return (
			<TenantReadOnlyCardError
				onRetry={restart}
				titleKey="common:list-unavailable-title"
				descriptionKey="common:list-error-default-description"
				error={error}
				testId="tenant-posts-scheduled-destinations-error"
			/>
		);
	}
	if (own.length === 0) {
		if (!isAggregating) {
			return null;
		}
		return (
			<Skeleton
				className="h-9 w-full"
				data-testid="tenant-posts-scheduled-destinations-loading"
			/>
		);
	}

	return (
		<section
			className="space-y-3"
			data-testid="tenant-posts-scheduled-destinations"
		>
			<div>
				<h2 className="text-[13px] font-medium text-foreground">
					{t('posts:scheduled-destinations-heading')}
				</h2>
				<p className="publy-type-helper text-muted-foreground">
					{t('posts:scheduled-destinations-description')}
				</p>
			</div>
			<ul className="space-y-3">
				{own.map((row) => {
					const isOpen = openId === row.publicationId;
					return (
						<li
							key={row.publicationId}
							className="space-y-3"
							data-testid="tenant-posts-scheduled-destination"
						>
							<div className="flex flex-wrap items-center gap-3">
								<span className="text-sm font-medium">
									{row.accountDisplayHandle ?? ''}
								</span>
								<ScheduledPublicationStatus row={row} />
								<ScheduledPublicationCustomized customized={row.customized} />
								<ScheduledPublicationTime row={row} />
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="ml-auto"
									aria-expanded={isOpen}
									aria-label={t('posts:destination-customize-aria', {
										destination: row.accountDisplayHandle ?? '',
									})}
									data-testid="tenant-posts-scheduled-customize"
									onClick={() => setOpenId(isOpen ? null : row.publicationId)}
								>
									{t('posts:destination-customize')}
								</Button>
							</div>
							{isOpen ? (
								<ScheduledRenditionEditor
									row={row}
									tenantId={tenantId}
									target={selection.targets.find(
										(candidate) => candidate.id === row.socialAccountId,
									)}
									body={body}
									segments={segments}
									images={images}
									isPostDirty={isPostDirty}
									onClose={() => setOpenId(null)}
								/>
							) : null}
						</li>
					);
				})}
			</ul>
		</section>
	);
};
