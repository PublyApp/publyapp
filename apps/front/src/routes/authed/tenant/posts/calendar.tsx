import { IconCalendarEvent } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

/**
 * Honest read-only calendar section: no posts API exists, so the page is a
 * coming-later state — never fabricated schedule data or fake post rows.
 */
const TenantPostsCalendarPage = () => {
	const { t } = useTranslation(['posts', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-posts-calendar-page">
			<WorkspacePageHeader titleKey="calendar" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:calendar')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconCalendarEvent}
						title={t('calendar-coming-later-title')}
						description={t('calendar-coming-later-description')}
						testId="tenant-posts-calendar-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/posts/')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'calendar' },
		],
		i18nNamespaces: ['posts'],
	},
	component: TenantPostsCalendarPage,
});
