import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { WorkspacePageHeader } from '../_workspace-page-parts';
import { buildUpcomingPublicationWindow } from './_scheduled-publication-helpers';
import { ScheduledPublicationQueueTable } from './_scheduled-publication-queue-table';
import { useScheduledPublicationPage } from './_use-scheduled-publication-page';

const QUEUE_STATUSES = ['scheduled', 'in_progress', 'paused'] as const;
const IN_PROGRESS_POLL_MS = 5_000;

const TenantPostsQueuePage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const page = useScheduledPublicationPage({
		tenantId: tenantId ?? '',
		createWindow: () => buildUpcomingPublicationWindow(new Date()),
		initialSize: 20,
		statuses: [...QUEUE_STATUSES],
	});
	const hasInProgress = page.rows.some((row) => row.status === 'in_progress');
	const refetch = page.query.refetch;
	useEffect(() => {
		if (!hasInProgress) {
			return;
		}

		const interval = setInterval(() => void refetch(), IN_PROGRESS_POLL_MS);
		return () => clearInterval(interval);
	}, [hasInProgress, refetch]);

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
	component: TenantPostsQueuePage,
});
