import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import QueryDisplay from '~/components/query-display';
import { Skeleton } from '~/components/ui/skeleton';
import { useTenantPublicationRenditionQuery } from '~/lib/query/tenant-publication-renditions';
import { toTenantPublicationRendition } from '~/lib/query/tenant-publication-renditions';
import type { TenantPublishTarget } from '~/lib/query/tenant-publish-targets';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { ComposerImage } from './_destination-media-field';
import { ScheduledRenditionForm } from './_scheduled-rendition-form';
import type { SegmentDraft } from './_segment-draft';

/** Loads a scheduled publication's stored overrides, then hands them to the
 * form. The form mounts once the rendition is here, so its draft starts from
 * what the server holds. */
export const ScheduledRenditionEditor = ({
	row,
	tenantId,
	target,
	body,
	segments,
	images,
	isPostDirty,
	onClose,
}: {
	row: ScheduledPublicationRow;
	tenantId: string;
	target: TenantPublishTarget | undefined;
	body: string;
	segments: readonly SegmentDraft[];
	images: readonly ComposerImage[];
	isPostDirty: boolean;
	onClose: () => void;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const query = useTenantPublicationRenditionQuery({
		publicationId: row.publicationId,
		tenantId,
	});

	return (
		<QueryDisplay
			query={query}
			LoadingSlot={
				<Skeleton
					className="h-24 w-full"
					data-testid="tenant-posts-rendition-loading"
				/>
			}
			ErrorSlot={
				<p
					className="flex items-center gap-2 text-sm text-destructive"
					role="alert"
					data-testid="tenant-posts-rendition-error"
				>
					<IconAlertCircle aria-hidden="true" className="size-4" />
					{getFailureMessage(toApiFailure(query.error), {
						fallback: t('common:an-error-occurred'),
					})}
				</p>
			}
		>
			{({ data }) => {
				const rendition = toTenantPublicationRendition(data);
				if (rendition === null) {
					return null;
				}
				return (
					<ScheduledRenditionForm
						row={row}
						tenantId={tenantId}
						rendition={rendition}
						target={target}
						body={body}
						segments={segments}
						images={images}
						isPostDirty={isPostDirty}
						onClose={onClose}
					/>
				);
			}}
		</QueryDisplay>
	);
};
