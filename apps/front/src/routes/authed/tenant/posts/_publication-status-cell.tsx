import { useTranslation } from 'react-i18next';
import { StatusPill } from '~/components/ui/product-page';
import { publicationStatusPresentation } from '~/lib/publishing/publication-status';
import type { TenantPublicationRow } from '~/lib/query/tenant-publications';

import { PublicationFailureDetails } from './_publication-failure-details';
import { PublicationSegmentProgress } from './_publication-segment-progress';

export const PublicationStatusCell = ({
	publication,
	tenantId,
	canPublish,
}: {
	publication: TenantPublicationRow;
	tenantId: string;
	canPublish: boolean;
}) => {
	const { t } = useTranslation(['posts', 'common']);

	const presentation = publicationStatusPresentation(publication.status);
	if (presentation === null) {
		return <span className="text-muted-foreground">{'—'}</span>;
	}

	// A newer publication replaced this row for the same post and account
	// (owner decision, 2026-10-24): it is history, not a live status. Muted,
	// labelled "Replaced", and never offered the failure details or a retry.
	// A replaced row that did publish keeps its status and its link: the post
	// is still on the provider.
	if (publication.superseded && publication.status !== 'published') {
		return (
			<div
				className="flex max-w-xs flex-col items-start gap-1 opacity-60"
				data-superseded="true"
			>
				<StatusPill
					tone="neutral"
					testId="tenant-posts-history-superseded-label"
				>
					{t('posts:publication-superseded')}
				</StatusPill>
				<p className="text-xs text-muted-foreground">
					{t('posts:publication-superseded-description')}
				</p>
			</div>
		);
	}

	const pill = (
		<StatusPill
			tone={presentation.tone}
			testId="tenant-posts-history-status-pill"
		>
			{t(presentation.labelKey)}
		</StatusPill>
	);

	const progress = (
		<PublicationSegmentProgress
			status={publication.status}
			published={publication.segmentsPublished}
			total={publication.segmentsTotal}
		/>
	);

	if (publication.status === 'published' && publication.externalUrl) {
		return (
			<div className="flex flex-col items-start gap-1">
				<div className="flex items-center gap-2">
					{pill}
					<a
						className="publy-record-link"
						data-testid="tenant-posts-history-link"
						href={publication.externalUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						{t('posts:view-on-bluesky')}
					</a>
				</div>
				{progress}
			</div>
		);
	}

	if (publication.status === 'failed' || publication.status === 'paused') {
		return (
			<div className="flex max-w-xs flex-col items-start gap-1">
				{pill}
				{progress}
				<PublicationFailureDetails
					publication={publication}
					tenantId={tenantId}
					canPublish={canPublish}
				/>
			</div>
		);
	}

	if (publication.segmentsTotal > 1) {
		return (
			<div className="flex flex-col items-start gap-1">
				{pill}
				{progress}
			</div>
		);
	}

	return pill;
};
