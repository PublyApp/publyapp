import { IconActivity } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { PageHeader, DetailRow } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import {
	toStaffJobQueueRows,
	useStaffJobQueueQuery,
	type StaffJobQueueRow,
} from '~/lib/query/staff-jobs';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { makeQueueColumns } from './_columns';
import {
	buildStaffJobsCursorResetKey,
	type StaffJobsListSearchParams,
	parseStaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
	type StaffJobsListSearchParamInput,
} from './_list-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 50;

const StaffJobsQueuePage = () => {
	const { t, i18n } = useTranslation(['staff-jobs', 'common']);
	const locale = i18n?.language ?? 'en';
	const [inspected, setInspected] = useState<StaffJobQueueRow | null>(null);

	const search = parseStaffJobsListSearchParams(
		Route.useSearch() as StaffJobsListSearchParamInput,
	);
	const navigate = Route.useNavigate();
	const onSearchChange = (next: StaffJobsListSearchParams): void => {
		void navigate({
			search: serializeStaffJobsListSearchParams(next),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: buildStaffJobsCursorResetKey(search),
	});

	const query = useStaffJobQueueQuery({
		status: search.status,
		jobType: search.jobType,
		tenantId: search.tenantId,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = toStaffJobQueueRows(query.data?.data);

	const columns = useMemo(
		() => makeQueueColumns(t, locale, (row) => setInspected(row)),
		[t, locale],
	);
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	const hasActiveFilters = Boolean(
		search.status || search.jobType || search.tenantId,
	);

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('queue-page-title')}
				description={t('queue-page-description')}
			/>
			<DataTable<StaffJobQueueRow>
				testId="staff-jobs-queue-table"
				ariaLabel={t('queue-page-title')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: hasActiveFilters,
				}}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: query.data?.nextCursor != null,
					isPaginationPending: query.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(query.data?.nextCursor ?? undefined),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				emptyIcon={IconActivity}
				emptyTitle={t('common:no-audit-logs-yet')}
				emptyContent={t('common:no-audit-logs-description')}
				noMatchTitle={t('no-rows-match-title')}
				noMatchContent={t('no-rows-match-description')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
			/>

			<Drawer
				open={inspected !== null}
				onOpenChange={(open) => {
					if (!open) {
						setInspected(null);
					}
				}}
			>
				<DrawerContent data-testid="staff-jobs-queue-drawer">
					<DrawerHeader>
						<DrawerTitle>{t('queue-drawer-title')}</DrawerTitle>
						<DrawerDescription>{inspected?.jobType ?? ''}</DrawerDescription>
					</DrawerHeader>
					<DrawerBody>
						{inspected ? (
							<>
								<DetailRow
									label={t('column-status')}
									value={inspected.status ?? t('no-value')}
								/>
								<DetailRow
									label={t('column-attempts')}
									value={`${inspected.attempts}/${inspected.maxAttempts}`}
								/>
								<DetailRow
									label={t('detail-last-error')}
									value={inspected.lastError ?? t('no-value')}
								/>
								<DetailRow
									label={t('column-next-attempt')}
									value={formatDateTime(inspected.nextAttemptAt, locale)}
								/>
								<DetailRow
									label={t('detail-created-at')}
									value={formatDateTime(inspected.createdAt, locale)}
								/>
							</>
						) : null}
					</DrawerBody>
				</DrawerContent>
			</Drawer>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/jobs/')({
	staticData: {
		i18nNamespaces: ['staff-jobs'],
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }],
	},
	validateSearch: (search) =>
		serializeStaffJobsListSearchParams(
			parseStaffJobsListSearchParams(search as StaffJobsListSearchParamInput),
		),
	component: StaffJobsQueuePage,
});
