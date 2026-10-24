import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import { StatusPill } from '~/components/ui/product-page';
import { publicationStatusPresentation } from '~/lib/publishing/publication-status';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';
import { formatInZone } from '~/utils/format-time';

type StatusRow = Pick<
	ScheduledPublicationRow,
	'status' | 'postStatus' | 'publishedCount' | 'destinationCount' | 'superseded'
>;

/** Some destinations of the post published and others did not: the post
 * status stays `failed` (owner decision, no partially-failed status) and the
 * counts carry the detail. */
const isMixedOutcome = (row: StatusRow): boolean =>
	row.postStatus === 'failed' &&
	row.publishedCount > 0 &&
	row.publishedCount < row.destinationCount;

/** A row's status pill. A replaced row (a newer publication took over its
 * post and account) reads "Replaced", never as a live status; a failed
 * destination of a post that partly published reads "Failed · 1/2
 * published" (a non-failed one gets that line under its own pill). */
export const ScheduledPublicationStatus = ({ row }: { row: StatusRow }) => {
	const { t } = useTranslation('posts');
	const presentation = publicationStatusPresentation(row.status);

	if (row.superseded) {
		return (
			<StatusPill tone="neutral" testId="tenant-posts-superseded-label">
				{t('posts:publication-superseded')}
			</StatusPill>
		);
	}

	const mixedLabel = isMixedOutcome(row)
		? t('posts:publish-status-failed-partial', {
				published: row.publishedCount,
				total: row.destinationCount,
			})
		: null;
	const pillLabel =
		mixedLabel !== null && row.status === 'failed'
			? mixedLabel
			: presentation && t(presentation.labelKey);

	return (
		<div className="flex flex-col items-start gap-1">
			<StatusPill
				tone={presentation?.tone ?? 'neutral'}
				testId="tenant-posts-status-pill"
			>
				{pillLabel ?? '—'}
			</StatusPill>
			{mixedLabel !== null && row.status !== 'failed' ? (
				<span
					className="text-xs text-muted-foreground"
					data-testid="tenant-posts-mixed-status"
				>
					{mixedLabel}
				</span>
			) : null}
		</div>
	);
};

/** "Customized": this destination overrides part of the post's content. */
export const ScheduledPublicationCustomized = ({
	customized,
}: {
	customized: boolean;
}) => {
	const { t } = useTranslation('posts');

	if (!customized) {
		return null;
	}
	return (
		<Badge variant="outline" data-testid="tenant-posts-customized-badge">
			{t('posts:publication-customized')}
		</Badge>
	);
};

/** A replaced row is history: muted, with the "Replaced" label in its status. */
export const MutedWhenSuperseded = ({
	superseded,
	children,
}: {
	superseded: boolean;
	children: ReactNode;
}) => (
	<div
		className={superseded ? 'opacity-60' : undefined}
		data-superseded={superseded ? 'true' : undefined}
	>
		{children}
	</div>
);

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
	superseded = false,
}: {
	status: string | null;
	cause: string | null;
	/** A replaced row is history: its old failure is not a live one. */
	superseded?: boolean;
}) => {
	const { t } = useTranslation('posts');

	if (
		superseded ||
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
}) => {
	const { i18n } = useTranslation('posts');
	const language = i18n.resolvedLanguage ?? i18n.language;

	return (
		<div className="min-w-0">
			<time dateTime={row.scheduledAtUtc.toISOString()} className="block">
				{formatInZone(row.scheduledAtUtc, row.timeZone, language)}
			</time>
			<span className="block truncate text-xs text-muted-foreground">
				{row.timeZone ?? '—'}
			</span>
		</div>
	);
};
