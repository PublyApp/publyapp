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
