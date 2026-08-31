import { IconCalendarEvent } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
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
import { useScheduledPublicationAllPages } from './_use-scheduled-publication-all-pages';

const TenantPostsCalendarPage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const window_ = buildVisibleMonthWindow(new Date());
	const { rows, isAggregating, shouldLogout, error } =
		useScheduledPublicationAllPages({
			tenantId: tenantId ?? '',
			window: window_,
			initialSize: 100,
		});
	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const isPending = isAggregating && rows.length === 0;
	const isError = error !== null && !isAggregating;

	let calendarBody: React.ReactNode;
	if (isPending) {
		calendarBody = (
			<TenantReadOnlyCardSkeleton testId="tenant-posts-calendar-loading" />
		);
	} else if (isError) {
		calendarBody = (
			<TenantReadOnlyCardError
				query={{
					refetch: async () =>
						({}) as Awaited<
							ReturnType<
								import('@tanstack/react-query').UseQueryResult['refetch']
							>
						>,
				}}
				titleKey="common:list-unavailable-title"
				descriptionKey="common:list-error-default-description"
				testId="tenant-posts-calendar-error"
			/>
		);
	} else if (rows.length > 0) {
		calendarBody = <ScheduledPublicationAgenda rows={rows} />;
	} else {
		calendarBody = (
			<StateSurface
				icon={IconCalendarEvent}
				title={t('calendar-empty-title')}
				description={t('calendar-empty-description')}
				testId="tenant-posts-calendar-empty"
			/>
		);
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
					{calendarBody}
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
