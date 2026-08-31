import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
	toScheduledPublicationRows,
	useScheduledPublicationsQuery,
} from '~/lib/query/tenant-scheduled-publications';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { ReadOnlyBadge, WorkspacePageHeader } from '../_workspace-page-parts';
import { buildUpcomingPublicationWindow } from './_scheduled-publication-helpers';
import { ScheduledPublicationQueueTable } from './_scheduled-publication-queue-table';

const QUEUE_STATUSES = ['scheduled', 'in_progress', 'paused'] as const;

const TenantPostsQueuePage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const [window] = useState(() => buildUpcomingPublicationWindow(new Date()));
	const [cursorHistory, setCursorHistory] = useState<string[]>([]);
	const [size, setSize] = useState(20);
	const cursor = cursorHistory.at(-1);
	const query = useScheduledPublicationsQuery({
		tenantId: tenantId ?? '',
		from: window.from,
		to: window.to,
		statuses: [...QUEUE_STATUSES],
		cursor,
		limit: size,
	});
	const rows = toScheduledPublicationRows(query.data);
	const nextCursor = query.data?.nextCursor ?? null;
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-5" data-testid="tenant-posts-queue-page">
			<WorkspacePageHeader titleKey="queue" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:queue')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-sm text-muted-foreground">
						{t('queue-description')}
					</p>
					<ScheduledPublicationQueueTable
						query={query}
						rows={rows}
						pagination={{
							pageIndex: cursorHistory.length,
							size,
							hasPreviousPage: cursorHistory.length > 0,
							hasNextPage: nextCursor !== null,
							isPaginationPending: query.isFetching,
							onNextPage: () => {
								if (nextCursor) {
									setCursorHistory((previous) => [...previous, nextCursor]);
								}
							},
							onPreviousPage: () =>
								setCursorHistory((previous) => previous.slice(0, -1)),
							onSizeChange: (nextSize) => {
								setSize(nextSize);
								setCursorHistory([]);
							},
						}}
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/posts/queue')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'queue' },
		],
		i18nNamespaces: ['posts'],
	},
	component: TenantPostsQueuePage,
});
