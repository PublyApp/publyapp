import { IconCalendarEvent } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import {
	TenantReadOnlyCardError,
	TenantReadOnlyCardSkeleton,
} from '../_read-only-query-slots';
import { ReadOnlyBadge, WorkspacePageHeader } from '../_workspace-page-parts';
import { ScheduledPublicationAgenda } from './_scheduled-publication-agenda';
import { buildVisibleMonthWindow } from './_scheduled-publication-helpers';
import { useScheduledPublicationPage } from './_use-scheduled-publication-page';

const TenantPostsCalendarPage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const page = useScheduledPublicationPage({
		tenantId: tenantId ?? '',
		createWindow: () => buildVisibleMonthWindow(new Date()),
		initialSize: 100,
	});
	if (page.shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-5" data-testid="tenant-posts-calendar-page">
			<WorkspacePageHeader titleKey="calendar" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:calendar')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-sm text-muted-foreground">
						{t('calendar-description')}
					</p>
					<QueryDisplay
						query={page.query}
						LoadingSlot={
							<TenantReadOnlyCardSkeleton testId="tenant-posts-calendar-loading" />
						}
						ErrorSlot={
							<TenantReadOnlyCardError
								query={page.query}
								titleKey="common:list-unavailable-title"
								descriptionKey="common:list-error-default-description"
								testId="tenant-posts-calendar-error"
							/>
						}
					>
						{() =>
							page.rows.length > 0 ? (
								<div className="space-y-4">
									<ScheduledPublicationAgenda rows={page.rows} />
									<DataTableCursorFooter
										testId="tenant-posts-calendar"
										pageIndex={page.pagination.pageIndex}
										size={page.pagination.size}
										onSizeChange={page.pagination.onSizeChange}
										pageRowCount={page.rows.length}
										hasPreviousPage={page.pagination.hasPreviousPage}
										hasNextPage={page.pagination.hasNextPage}
										isPaginationPending={page.pagination.isPaginationPending}
										onNextPage={page.pagination.onNextPage}
										onPreviousPage={page.pagination.onPreviousPage}
										variant="flat"
									/>
								</div>
							) : (
								<StateSurface
									icon={IconCalendarEvent}
									title={t('calendar-empty-title')}
									description={t('calendar-empty-description')}
									testId="tenant-posts-calendar-empty"
								/>
							)
						}
					</QueryDisplay>
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
