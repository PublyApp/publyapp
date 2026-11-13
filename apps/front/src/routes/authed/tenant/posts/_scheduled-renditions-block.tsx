import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import {
	POSTS_PUBLISH,
	useTenantPermissions,
} from '~/lib/query/tenant-permissions';
import {
	toScheduledPublicationRows,
	usePostPublicationsQuery,
} from '~/lib/query/tenant-scheduled-publications';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { TenantReadOnlyCardError } from '../_read-only-query-slots';
import type { ComposerImage } from './_destination-media-field';
import { CUSTOMIZABLE_STATUSES } from './_queries';
import {
	ScheduledPublicationCustomized,
	ScheduledPublicationStatus,
	ScheduledPublicationTime,
} from './_scheduled-publication-display';
import { ScheduledRenditionEditor } from './_scheduled-rendition-editor';
import type { SegmentDraft } from './_segment-draft';
import type { PublishSelection } from './_use-publish-selection';

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
	const [openId, setOpenId] = useState<string | null>(null);
	const query = usePostPublicationsQuery({ postId, tenantId });
	// The server already leaves out cancelled and replaced rows.
	const rows = toScheduledPublicationRows(query.data).filter(
		(row) => row.status !== null && CUSTOMIZABLE_STATUSES.includes(row.status),
	);

	if (!hasPermission(POSTS_PUBLISH)) {
		return null;
	}
	return (
		<QueryDisplay
			query={query}
			isEmpty={() => rows.length === 0}
			LoadingSlot={
				<Skeleton
					className="h-9 w-full"
					data-testid="tenant-posts-scheduled-destinations-loading"
				/>
			}
			ErrorSlot={({ error }) =>
				shouldLogoutForFailure(error) ? (
					<LogoutRedirect />
				) : (
					<TenantReadOnlyCardError
						onRetry={() => void query.refetch()}
						titleKey="common:list-unavailable-title"
						descriptionKey="common:list-error-default-description"
						error={error}
						testId="tenant-posts-scheduled-destinations-error"
					/>
				)
			}
			EmptySlot={null}
		>
			<section
				className="@container mt-6 space-y-3"
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
					{rows.map((row) => {
						const isOpen = openId === row.publicationId;
						return (
							<li
								key={row.publicationId}
								className="space-y-3"
								data-testid="tenant-posts-scheduled-destination"
							>
								{/* Narrow (the edit column is ~35rem even on a wide screen): handle and
										 action on one line, status and date under them. Wide container:
										 one aligned line per destination. */}
								<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @2xl:grid-cols-[minmax(0,1fr)_8rem_12rem_auto] @2xl:gap-x-4">
									<span
										className="col-start-1 row-start-1 min-w-0 truncate text-sm font-medium"
										title={row.accountDisplayHandle ?? undefined}
									>
										{row.accountDisplayHandle ?? ''}
									</span>
									<div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 @2xl:contents">
										<div className="flex flex-wrap items-center gap-2">
											<ScheduledPublicationStatus row={row} />
											<ScheduledPublicationCustomized
												customized={row.customized}
											/>
										</div>
										<ScheduledPublicationTime row={row} />
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="col-start-2 row-start-1 whitespace-nowrap @2xl:col-start-4"
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
		</QueryDisplay>
	);
};
