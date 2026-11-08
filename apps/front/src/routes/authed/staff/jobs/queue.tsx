import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { DetailRow } from '~/components/ui/product-page';
import {
	toStaffJobQueueRows,
	useStaffJobQueueQuery,
	type StaffJobQueueRow,
} from '~/lib/query/staff-jobs';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';
import { formatDateTime } from '~/utils/format-time';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { jobLabel } from './_job-catalogue';
import { formatFailureCause } from './_jobs-helpers';
import {
	exportJobRows,
	queueColumns,
	queueFilters,
	queueMobileCard,
	queueTotals,
} from './_jobs-list-config';
import { buildJobFamilyCounts, useJobsOverview } from './_jobs-overview';
import {
	buildJobsPanelGroups,
	jobsSectionPath,
	type JobsSection,
} from './_jobs-panel';
import { QueueRowActions } from './_jobs-row-actions';
import { JobsStatCards } from './_jobs-stat-cards';
import {
	buildStaffJobsCursorResetKey,
	parseStaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
	type StaffJobsListSearchParamInput,
} from './_list-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const splitFilter = (value: string | undefined): string[] =>
	value ? value.split(',') : [];

const StaffJobsQueuePage = () => {
	const { t, i18n } = useTranslation(['staff-jobs', 'common']);
	const locale = i18n?.language ?? 'en';
	const [inspected, setInspected] = useState<StaffJobQueueRow | null>(null);

	const search = parseStaffJobsListSearchParams(
		Route.useSearch() as StaffJobsListSearchParamInput,
	);
	const navigate = Route.useNavigate();
	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeStaffJobsListSearchParams({ ...search, ...next }),
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
		q: search.q,
		status: search.status,
		jobType: search.jobType,
		tenantId: search.tenantId,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = toStaffJobQueueRows(query.data?.data);
	const overview = useJobsOverview();
	const counts = query.data?.counts;
	const globalCounts = overview.queueCounts;
	const filterCounts = {
		status: {
			pending: globalCounts?.pending ?? null,
			processing: globalCounts?.processing ?? null,
			completed: 0,
			failed: 0,
		},
		retry: {
			retry: globalCounts?.retrying ?? null,
			first:
				globalCounts === null
					? null
					: (globalCounts.total ?? 0) - (globalCounts.retrying ?? 0),
		},
		family: buildJobFamilyCounts(
			globalCounts?.byJobType?.map((row) => ({
				key: row.jobType,
				count: row.count ?? 0,
			})),
		),
	};

	const filtersValue: ListFiltersValue = {
		status: splitFilter(search.status),
		family: splitFilter(search.family),
		retry: splitFilter(search.retry),
	};
	const columns = queueColumns(t, locale);

	const setFilters = (next: ListFiltersValue): void => {
		void navigate({
			search: serializeStaffJobsListSearchParams({
				...search,
				status: (next.status ?? []).join(',') || undefined,
				family: (next.family ?? []).join(',') || undefined,
				retry: (next.retry ?? []).join(',') || undefined,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const onShortcut = (key: string, value: string): void => {
		const next: ListFiltersValue = { status: [], family: [], retry: [] };
		if (!(filtersValue[key] ?? []).includes(value)) {
			next[key] = [value];
		}
		setFilters(next);
	};

	const onSection = (section: JobsSection): void => {
		void navigate({ to: jobsSectionPath(section) });
	};

	// `totalCount`/`counts` describe the whole filtered collection (#2301).
	const countsKnown = query.data !== undefined;

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	return (
		<ListPage
			testId="staff-jobs-queue-table"
			ariaLabel={t('queue-page-title')}
			title={t('queue-page-title')}
			searchPlaceholder={t('jobs-search-placeholder')}
			rows={rows}
			columns={columns}
			defaultColumns={[
				'type',
				'status',
				'org',
				'attempts',
				'priority',
				'next',
				'error',
			]}
			lockedColumn="type"
			sorting={[
				{ id: controller.sort.id, desc: controller.sort.order === 'desc' },
			]}
			onSortingChange={(next) =>
				controller.onSortChange(
					next[0]
						? { id: next[0].id, order: next[0].desc ? 'desc' : 'asc' }
						: undefined,
				)
			}
			q={search.q ?? ''}
			onSearch={(next) =>
				onSearchChange({ ...search, q: next, cursor: undefined })
			}
			filters={queueFilters(t)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			countsKnown={countsKnown}
			emptyText={t('queue-empty-description')}
			locale={locale}
			cards={<JobsStatCards overview={overview} t={t} />}
			totals={queueTotals(t, counts)}
			panelGroups={buildJobsPanelGroups({
				t,
				current: 'queue',
				overview,
				filterCounts,
				filters: queueFilters(t),
				filtersValue,
				onSection,
				onShortcut,
			})}
			onOpen={(row) => setInspected(row)}
			openLabel={(row) =>
				t('common:list-open-row', { name: jobLabel(t, row.jobType) })
			}
			rowLabel={(row) => jobLabel(t, row.jobType)}
			mobileCard={queueMobileCard(t)}
			renderActions={(row) => (
				<QueueRowActions row={row} t={t} onInspect={setInspected} />
			)}
			onExport={() => exportJobRows(rows, columns, t, 'jobs-export-queue')}
			query={query}
			footer={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId="staff-jobs-queue-table"
						pageIndex={controller.cursor.pageIndex}
						size={controller.size}
						onSizeChange={controller.onSizeChange}
						pageRowCount={rows.length}
						hasPreviousPage={controller.cursor.hasPreviousPage}
						hasNextPage={query.data?.nextCursor != null}
						isPaginationPending={query.isFetching}
						onNextPage={() =>
							controller.cursor.onNextPage(query.data?.nextCursor ?? undefined)
						}
						onPreviousPage={controller.cursor.onPreviousPage}
						variant="flat"
					/>
				) : null
			}
			after={
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
										value={inspected.status ?? t('common:no-value')}
									/>
									<DetailRow
										label={t('common:column-attempts')}
										value={`${inspected.attempts}/${inspected.maxAttempts}`}
									/>
									<DetailRow
										label={t('detail-last-error')}
										value={formatFailureCause(inspected.lastError, t)}
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
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/jobs/')({
	staticData: {
		i18nNamespaces: ['staff-jobs'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }],
	},
	validateSearch: (search) =>
		serializeStaffJobsListSearchParams(
			parseStaffJobsListSearchParams(search as StaffJobsListSearchParamInput),
		),
	component: StaffJobsQueuePage,
});
