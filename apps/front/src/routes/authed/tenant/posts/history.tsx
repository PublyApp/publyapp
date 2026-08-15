import { IconHistory } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/posts/history')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'history' },
		],
		i18nNamespaces: ['posts'],
	},
	component: TenantPostsHistoryPage,
});

/**
 * Honest read-only history section: no posts API exists, so the page is a
 * coming-later state — never fabricated published-post rows.
 */
function TenantPostsHistoryPage() {
	const { t } = useTranslation(['posts', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-posts-history-page">
			<WorkspacePageHeader titleKey="history" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:history')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconHistory}
						title={t('history-coming-later-title')}
						description={t('history-coming-later-description')}
						testId="tenant-posts-history-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
