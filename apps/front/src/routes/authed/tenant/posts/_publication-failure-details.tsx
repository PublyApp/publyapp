import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { StatusPill } from '~/components/ui/product-page';
import { isVisuallyBlank } from '~/lib/is-visually-blank';
import {
	accountProfileUrl,
	publicationFailurePresentation,
	retryAvailability,
} from '~/lib/publishing/publication-failure';
import {
	useMarkPublicationPublishedMutation,
	useRetryPublicationMutation,
	type TenantPublicationRow,
} from '~/lib/query/tenant-publications';

/** Category pill, plain-words cause (never blank, #2013), attempt count and
 * the row's one primary action for a Failed/Paused publication (#647). */
export const PublicationFailureDetails = ({
	publication,
	tenantId,
	canPublish,
}: {
	publication: TenantPublicationRow;
	tenantId: string;
	canPublish: boolean;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const retry = useRetryPublicationMutation();
	const markPublished = useMarkPublicationPublishedMutation();
	// Needs-review actions can post twice, so each asks first (#2176).
	const [pendingReview, setPendingReview] = useState<'mark' | 'retry' | null>(
		null,
	);
	const presentation = publicationFailurePresentation(
		publication.status,
		publication.failureCategory,
		publication.accountUsable,
	);
	if (presentation === null) {
		return null;
	}

	const storedCause = publication.lastError?.trim() ?? '';
	const cause = isVisuallyBlank(storedCause)
		? t(presentation.messageKey)
		: storedCause;
	const causeKey =
		publication.status === 'paused'
			? 'posts:publication-paused-cause'
			: 'posts:publication-failed-cause';
	const availability = retryAvailability({
		status: publication.status,
		accountUsable: publication.accountUsable,
		superseded: publication.superseded,
		canPublish,
	});
	const isReview = presentation.primaryAction === 'review';
	const profileUrl = accountProfileUrl(publication.accountLabel);
	const retryTitle = availability.enabled
		? undefined
		: t(availability.reasonKey);

	return (
		<div className="flex flex-col items-start gap-1">
			<StatusPill
				tone={presentation.tone}
				testId="tenant-posts-history-category-pill"
			>
				{t(presentation.pillKey)}
			</StatusPill>
			<p
				className="text-xs text-muted-foreground"
				data-testid="tenant-posts-publication-cause"
			>
				{t(causeKey, { cause })}
			</p>
			<p
				className="text-xs text-muted-foreground"
				data-testid="tenant-posts-publication-attempts"
			>
				{t('posts:publication-attempts', { count: publication.attempts })}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				{presentation.primaryAction === 'reconnect' ? (
					<Link
						to="/tenant/settings/integrations"
						className="publy-record-link"
						data-testid="tenant-posts-publication-primary-action"
					>
						{t('posts:publication-action-reconnect')}
					</Link>
				) : null}
				{presentation.primaryAction === 'edit' && publication.postId ? (
					<Link
						to="/tenant/posts/$postId/edit"
						params={{ postId: publication.postId }}
						className="publy-record-link"
						data-testid="tenant-posts-publication-primary-action"
					>
						{t('posts:publication-action-edit')}
					</Link>
				) : null}
				{isReview && profileUrl !== null ? (
					<a
						href={profileUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="publy-record-link"
						data-testid="tenant-posts-publication-profile-link"
					>
						{t('posts:publication-review-open-profile')}
					</a>
				) : null}
				{isReview ? (
					<Button
						size="sm"
						disabled={!canPublish || markPublished.isPending || retry.isPending}
						data-testid="tenant-posts-publication-primary-action"
						onClick={() => setPendingReview('mark')}
					>
						{t('posts:publication-action-mark-published')}
					</Button>
				) : null}
				<Button
					variant={
						presentation.primaryAction === 'retry' ? 'default' : 'outline'
					}
					size="sm"
					disabled={
						!availability.enabled || retry.isPending || markPublished.isPending
					}
					title={retryTitle}
					onClick={() => {
						if (isReview) {
							setPendingReview('retry');
							return;
						}
						retry.mutate({ tenantId, publicationId: publication.id });
					}}
				>
					{t('posts:publish-retry')}
				</Button>
			</div>
			<ConfirmDialog
				isOpen={pendingReview !== null}
				tone="primary"
				title={
					pendingReview === 'retry'
						? t('posts:publication-review-retry-title')
						: t('posts:publication-review-mark-title')
				}
				description={
					pendingReview === 'retry'
						? t('posts:publication-review-retry-description')
						: t('posts:publication-review-mark-description')
				}
				confirmLabel={
					pendingReview === 'retry'
						? t('posts:publication-review-retry-confirm')
						: t('posts:publication-action-mark-published')
				}
				onConfirm={() => {
					const variables = { tenantId, publicationId: publication.id };
					if (pendingReview === 'retry') {
						retry.mutate(variables);
					} else {
						markPublished.mutate(variables);
					}
					setPendingReview(null);
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setPendingReview(null);
					}
				}}
			/>
		</div>
	);
};
