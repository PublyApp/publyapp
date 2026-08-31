import { IconCalendarEvent } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';
import {
	toScheduledPublicationRows,
	useScheduledPublicationsQuery,
} from '~/lib/query/tenant-scheduled-publications';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantReadOnlyCardError,
	TenantReadOnlyCardSkeleton,
} from '../_read-only-query-slots';
import { ReadOnlyBadge, WorkspacePageHeader } from '../_workspace-page-parts';
import { ScheduledPublicationAgenda } from './_scheduled-publication-agenda';
import { buildVisibleMonthWindow } from './_scheduled-publication-helpers';

const TenantPostsCalendarPage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const [window] = useState(() => buildVisibleMonthWindow(new Date()));
	const [cursorHistory, setCursorHistory] = useState<string[]>([]);
	const [size, setSize] = useState(100);
	const cursor = cursorHistory.at(-1);
	const query = useScheduledPublicationsQuery({
		tenantId: tenantId ?? '',
		from: window.from,
		to: window.to,
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
						query={query}
						LoadingSlot={
							<TenantReadOnlyCardSkeleton testId="tenant-posts-calendar-loading" />
						}
						ErrorSlot={
							<TenantReadOnlyCardError
								query={query}
								titleKey="common:list-unavailable-title"
								descriptionKey="common:list-error-default-description"
								testId="tenant-posts-calendar-error"
							/>
						}
					>
						{() =>
							rows.length > 0 ? (
								<div className="space-y-4">
									<ScheduledPublicationAgenda rows={rows} />
									<DataTableCursorFooter
										testId="tenant-posts-calendar"
										pageIndex={cursorHistory.length}
										size={size}
										onSizeChange={(nextSize) => {
											setSize(nextSize);
											setCursorHistory([]);
										}}
										pageRowCount={rows.length}
										hasPreviousPage={cursorHistory.length > 0}
										hasNextPage={nextCursor !== null}
										isPaginationPending={query.isFetching}
										onNextPage={() => {
											if (nextCursor) {
												setCursorHistory((previous) => [
													...previous,
													nextCursor,
												]);
											}
										}}
										onPreviousPage={() =>
											setCursorHistory((previous) => previous.slice(0, -1))
										}
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
