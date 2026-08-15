import { IconListCheck } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

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

/**
 * Honest read-only queue section: no posts API exists, so the page is a
 * coming-later state — never fabricated queued-post rows.
 */
function TenantPostsQueuePage() {
	const { t } = useTranslation(['posts', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-posts-queue-page">
			<WorkspacePageHeader titleKey="queue" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:queue')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconListCheck}
						title={t('queue-coming-later-title')}
						description={t('queue-coming-later-description')}
						testId="tenant-posts-queue-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
