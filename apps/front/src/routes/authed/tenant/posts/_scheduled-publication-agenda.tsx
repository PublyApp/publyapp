import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import {
	ScheduledPublicationCause,
	ScheduledPublicationStatus,
	ScheduledPublicationTime,
} from './_scheduled-publication-display';
import { groupScheduledPublicationsByViewerDate } from './_scheduled-publication-helpers';

const ScheduledPublicationIdentity = ({
	row,
}: {
	row: ScheduledPublicationRow;
}) => {
	const { t } = useTranslation('posts');

	const body = (
		<div className="min-w-0">
			<p className="truncate font-medium">{row.postBodyPreview ?? '—'}</p>
			<p className="truncate text-xs text-muted-foreground">
				{row.accountDisplayHandle ?? '—'}
			</p>
		</div>
	);

	if (row.postId) {
		return (
			<Link
				title={t('posts:publication-open-post')}
				to="/tenant/posts/$postId/edit"
				params={{ postId: row.postId }}
				className="publy-record-link flex min-w-0 no-underline"
			>
				{body}
			</Link>
		);
	}

	return body;
};

export const ScheduledPublicationAgenda = ({
	rows,
}: {
	rows: ScheduledPublicationRow[];
}) => {
	const groups = groupScheduledPublicationsByViewerDate(rows);

	return (
		<div className="space-y-4">
			{groups.map((group) => (
				<Card
					key={group.date}
					size="sm"
					data-testid={`tenant-posts-calendar-day-${group.date}`}
				>
					<CardHeader>
						<CardTitle>
							<time dateTime={group.date}>{group.date}</time>
						</CardTitle>
					</CardHeader>
					<CardContent className="divide-y divide-border">
						{group.rows.map((row) => {
							return (
								<article key={row.id} className="py-3 first:pt-0 last:pb-0">
									<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
										<ScheduledPublicationIdentity row={row} />
										<ScheduledPublicationStatus status={row.status} />
										<ScheduledPublicationTime row={row} />
									</div>
									<ScheduledPublicationCause
										status={row.status}
										cause={row.lastError}
									/>
								</article>
							);
						})}
					</CardContent>
				</Card>
			))}
		</div>
	);
};
