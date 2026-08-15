import { IconPencil } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/posts/drafts')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'drafts' },
		],
		i18nNamespaces: ['posts'],
	},
	component: TenantPostsDraftsPage,
});

/**
 * Honest read-only drafts section: no posts API exists, so the page is a
 * coming-later state — never fabricated draft rows.
 */
function TenantPostsDraftsPage() {
	const { t } = useTranslation(['posts', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-posts-drafts-page">
			<WorkspacePageHeader titleKey="drafts" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:drafts')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconPencil}
						title={t('drafts-coming-later-title')}
						description={t('drafts-coming-later-description')}
						testId="tenant-posts-drafts-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
