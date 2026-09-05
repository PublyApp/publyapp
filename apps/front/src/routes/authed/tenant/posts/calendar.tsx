import { IconCalendarEvent } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';
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
	const { rows, isAggregating, shouldLogout, error, restart } =
		useScheduledPublicationAllPages({
			tenantId: tenantId ?? '',
			window: window_,
			initialSize: 100,
		});
	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// QueryDisplay owns the calendar body's loading/error/empty/data slots
	// (#1250 PR 2 migration), reusing the shared read-only-card skeleton and
	// error surface. The all-pages walk exposes derived state rather than a raw
	// UseQueryResult, so we adapt it into the shape QueryDisplay reads: isPending
	// while the walk is aggregating with nothing to show yet, isError once the
	// walk stops on a terminal failure. QueryDisplay intentionally gives that
	// terminal error precedence over partial rows, so retry restarts the complete
	// cursor walk rather than presenting a view that looks complete.
	const readQuery = {
		data: rows,
		isPending: isAggregating && rows.length === 0,
		isLoading: isAggregating && rows.length === 0,
		isFetching: isAggregating,
		isError: error !== null,
		error,
		refetch: () => restart(),
	} as UseQueryResult<ScheduledPublicationRow[], Error>;

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
						query={readQuery}
						LoadingSlot={
							<TenantReadOnlyCardSkeleton testId="tenant-posts-calendar-loading" />
						}
						ErrorSlot={
							<TenantReadOnlyCardError
								onRetry={restart}
								titleKey="common:list-unavailable-title"
								descriptionKey="common:list-error-default-description"
								testId="tenant-posts-calendar-error"
							/>
						}
						EmptySlot={
							<StateSurface
								icon={IconCalendarEvent}
								title={t('calendar-empty-title')}
								description={t('calendar-empty-description')}
								testId="tenant-posts-calendar-empty"
							/>
						}
					>
						{({ data }) => <ScheduledPublicationAgenda rows={data} />}
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
