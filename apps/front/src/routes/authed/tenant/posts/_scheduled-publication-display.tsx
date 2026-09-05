import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '~/components/ui/product-page';
import { publicationStatusPresentation } from '~/lib/publication-status';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import { formatScheduledLocalDateTime } from './_scheduled-publication-helpers';

export const ScheduledPublicationStatus = ({
	status,
}: {
	status: string | null;
}) => {
	const { t } = useTranslation('posts');
	const presentation = publicationStatusPresentation(status);

	return (
		<StatusPill tone={presentation?.tone ?? 'neutral'}>
			{presentation ? t(`posts:${presentation.labelKey}`) : '—'}
		</StatusPill>
	);
};

/**
 * Renders the transparent-failure cause for a Failed/Paused scheduled row
 * (owner product rule: every failure surfaces a plain-words reason and, where
 * one exists, the next action). Failed rows show the verbatim sanitised cause;
 * Paused rows add the reconnect next action as a title/aria affordance. Rows
 * without a stored cause, or on any other status, render nothing — the entity
 * invariant clears LastError on every non-failure transition.
 */
export const ScheduledPublicationCause = ({
	status,
	cause,
}: {
	status: string | null;
	cause: string | null;
}) => {
	const { t } = useTranslation('posts');

	if (
		cause === null ||
		cause === '' ||
		(status !== 'failed' && status !== 'paused')
	) {
		return null;
	}

	if (status === 'paused') {
		return (
			<p
				className="text-xs text-muted-foreground"
				title={t('posts:publication-paused-next-action')}
				data-testid="tenant-posts-publication-cause"
			>
				<span>{t('posts:publication-paused-cause', { cause })}</span>{' '}
				<Link
					to="/tenant/settings/integrations"
					className="publy-record-link"
					aria-label={t('posts:publication-paused-next-action-aria')}
				>
					{t('posts:publication-paused-next-action-link')}
				</Link>
			</p>
		);
	}

	return (
		<p
			className="text-xs text-muted-foreground"
			data-testid="tenant-posts-publication-cause"
		>
			{t('posts:publication-failed-cause', { cause })}
		</p>
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
