import { useTranslation } from 'react-i18next';
import { StatusPill } from '~/components/ui/product-page';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import {
	formatScheduledLocalDateTime,
	scheduledPublicationStatusLabelKey,
	scheduledPublicationStatusTone,
} from './_scheduled-publication-helpers';

export const ScheduledPublicationStatus = ({
	status,
}: {
	status: string | null;
}) => {
	const { t } = useTranslation('posts');
	const labelKey = scheduledPublicationStatusLabelKey(status);

	return (
		<StatusPill tone={scheduledPublicationStatusTone(status)}>
			{labelKey ? t(labelKey) : '—'}
		</StatusPill>
	);
};

export const ScheduledPublicationTime = ({
	row,
}: {
	row: ScheduledPublicationRow;
}) => (
	<div className="min-w-0">
		<time dateTime={row.scheduledAtUtc.toISOString()} className="block">
			{formatScheduledLocalDateTime(row.scheduledAtLocal)}
		</time>
		<span className="block truncate text-xs text-muted-foreground">
			{row.timeZone ?? '—'}
		</span>
	</div>
);
