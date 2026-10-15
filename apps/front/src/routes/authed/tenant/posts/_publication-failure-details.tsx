import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { StatusPill } from '~/components/ui/product-page';
import {
	publicationFailurePresentation,
	retryAvailability,
} from '~/lib/publishing/publication-failure';
import {
	useRetryPublicationMutation,
	type TenantPublicationRow,
} from '~/lib/query/tenant-publications';

import { isVisuallyBlank } from '../../staff/jobs/_jobs-helpers';

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
	const presentation = publicationFailurePresentation(
		publication.status,
		publication.failureCategory,
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
		accountNeedsReconnect: publication.accountNeedsReconnect,
		canPublish,
	});
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
				<Button
					variant={
						presentation.primaryAction === 'retry' ? 'default' : 'outline'
					}
					size="sm"
					disabled={!availability.enabled || retry.isPending}
					title={retryTitle}
					onClick={() =>
						retry.mutate({ tenantId, publicationId: publication.id })
					}
				>
					{t('posts:publish-retry')}
				</Button>
			</div>
		</div>
	);
};
