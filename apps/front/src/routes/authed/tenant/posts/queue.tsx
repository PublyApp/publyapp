import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	resolveWorkspaceTenantIdFromCache,
	useResolvedWorkspaceTenantId,
} from '~/lib/query/tenants-for-picker';

import { WorkspacePageHeader } from '../_workspace-page-parts';
import { postQueueQueries, QUEUE_PAGE_SIZE, QUEUE_STATUSES } from './_queries';
import {
	buildUpcomingPublicationWindow,
	nextPollingDelayMs,
} from './_scheduled-publication-helpers';
import { ScheduledPublicationQueueTable } from './_scheduled-publication-queue-table';
import { useScheduledPublicationPage } from './_use-scheduled-publication-page';

const TenantPostsQueuePage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const page = useScheduledPublicationPage({
		tenantId: tenantId ?? '',
		createWindow: () => buildUpcomingPublicationWindow(new Date()),
		initialSize: QUEUE_PAGE_SIZE,
		statuses: [...QUEUE_STATUSES],
	});
	const { rows, query } = page;
	const { refetch, dataUpdatedAt } = query;
	useEffect(() => {
		const delay = nextPollingDelayMs({ rows, now: new Date() });
		if (delay === null) {
			return;
		}

		const timeoutId = setTimeout(() => {
			void refetch();
		}, delay);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [rows, refetch, dataUpdatedAt]);

	if (page.shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill" data-testid="tenant-posts-queue-page">
			<WorkspacePageHeader titleKey="queue" />

			<p className="text-sm text-muted-foreground">{t('queue-description')}</p>
			<ScheduledPublicationQueueTable
				query={page.query}
				rows={page.rows}
				pagination={page.pagination}
			/>
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
	loader: ({ context }) => {
		const tenantId = resolveWorkspaceTenantIdFromCache(context.queryClient);
		if (tenantId === null) {
			return;
		}
		preloadRouteQueries(context.queryClient, postQueueQueries({ tenantId }));
	},
	component: TenantPostsQueuePage,
});
