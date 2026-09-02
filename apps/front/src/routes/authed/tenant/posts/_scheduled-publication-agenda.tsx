import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import {
	ScheduledPublicationStatus,
	ScheduledPublicationTime,
} from './_scheduled-publication-display';
import { groupScheduledPublicationsByViewerDate } from './_scheduled-publication-helpers';

const ScheduledPublicationIdentity = ({
	row,
}: {
	row: ScheduledPublicationRow;
}) => {
	return (
		<div className="min-w-0">
			<p className="truncate font-medium">{row.postBodyPreview ?? '—'}</p>
			<p className="truncate text-xs text-muted-foreground">
				{row.accountDisplayHandle ?? '—'}
			</p>
		</div>
	);
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
								<article
									key={row.id}
									className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
								>
									{row.postId ? (
										<Link
											to="/tenant/posts/$postId/edit"
											params={{ postId: row.postId }}
											className="publy-record-link flex min-w-0 no-underline"
										>
											<ScheduledPublicationIdentity row={row} />
										</Link>
									) : (
										<ScheduledPublicationIdentity row={row} />
									)}
									<ScheduledPublicationStatus status={row.status} />
									<ScheduledPublicationTime row={row} />
								</article>
							);
						})}
					</CardContent>
				</Card>
			))}
		</div>
	);
};
