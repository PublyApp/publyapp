import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffSystemJobDefinitionRows,
	useStaffSystemJobDefinitionsQuery,
} from '~/lib/query/staff-jobs';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { jobLabel } from './_job-catalogue';
import {
	exportJobRows,
	systemJobColumns,
	systemJobFilters,
	systemJobMobileCard,
	systemJobTotals,
} from './_jobs-list-config';
import { useJobsOverview } from './_jobs-overview';
import {
	buildJobsPanelGroups,
	jobsSectionPath,
	type JobsSection,
} from './_jobs-panel';
import { SystemJobRowActions } from './_jobs-row-actions';
import { JobsStatCards } from './_jobs-stat-cards';
import {
	buildStaffJobsCursorResetKey,
	parseStaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
	type StaffJobsListSearchParamInput,
} from './_list-search-params';
import { useStaffJobPermissions } from './_permissions';
import { SystemCronDialog } from './_system-cron-dialog';
import { useSystemJobActions } from './_use-system-job-actions';

const DEFAULT_SORT = { id: 'updated_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const splitFilter = (value: string | undefined): string[] =>
	value ? value.split(',') : [];

const StaffJobsSystemJobsPage = () => {
	const { t, i18n } = useTranslation(['staff-jobs', 'common']);
	const locale = i18n?.language ?? 'en';
	const queryClient = useQueryClient();
	const permissions = useStaffJobPermissions();
	const [shouldLogout, setShouldLogout] = useState(false);
	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const actions = useSystemJobActions({
		t,
		permissions,
		queryClient,
		onSessionExpired,
	});

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

	const enabledFilters = splitFilter(search.isEnabled);
	// The API takes one boolean, so two selected values mean "no server
	// filter"; the generic list still applies both (i.e. everything).
	const serverEnabled =
		enabledFilters.length === 1 ? enabledFilters[0] : undefined;
	const query = useStaffSystemJobDefinitionsQuery({
		q: search.q,
		isEnabled: serverEnabled,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = toStaffSystemJobDefinitionRows(query.data?.data);
	const overview = useJobsOverview();
	const counts = query.data?.counts;
	const globalCounts = overview.systemJobCounts;
	const filterCounts = {
		state: {
			true: globalCounts?.enabled ?? null,
			false: globalCounts?.disabled ?? null,
		},
		family: {},
	};

	const filtersValue: ListFiltersValue = {
		state: enabledFilters,
		family: splitFilter(search.family),
	};
	const updateDenied = permissions.loadError || !permissions.canUpdateSystemJob;
	const triggerDenied =
		permissions.loadError || !permissions.canTriggerSystemJob;
	const explanation = permissions.isPending
		? t('action-permission-checking')
		: t('action-permission-denied');
	const columns = systemJobColumns(t, locale, {
		permissionsPending: permissions.isPending,
		updateDenied,
		isTogglePending: actions.enabledPending,
		explanation,
		onToggleEnabled: actions.onToggleEnabled,
	});

	const setFilters = (next: ListFiltersValue): void => {
		void navigate({
			search: serializeStaffJobsListSearchParams({
				...search,
				isEnabled: (next.state ?? []).join(',') || undefined,
				family: (next.family ?? []).join(',') || undefined,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const onShortcut = (key: string, value: string): void => {
		const next: ListFiltersValue = { state: [], family: [] };
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

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<ListPage
			testId="staff-jobs-system-table"
			ariaLabel={t('system-page-title')}
			title={t('system-page-title')}
			searchPlaceholder={t('jobs-search-placeholder')}
			rows={rows}
			columns={columns}
			defaultColumns={['type', 'what', 'state', 'cron', 'last', 'updatedAt']}
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
			filters={systemJobFilters(t)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			countsKnown={countsKnown}
			emptyText={t('system-empty-description')}
			locale={locale}
			cards={<JobsStatCards overview={overview} t={t} />}
			totals={systemJobTotals(t, counts)}
			panelGroups={buildJobsPanelGroups({
				t,
				current: 'system',
				overview,
				filterCounts,
				filters: systemJobFilters(t),
				filtersValue,
				onSection,
				onShortcut,
			})}
			onOpen={actions.openCronDialog}
			openLabel={() => t('action-edit-cron')}
			rowLabel={(row) => jobLabel(t, row.jobKey)}
			mobileCard={systemJobMobileCard(t)}
			renderActions={(row) => (
				<SystemJobRowActions
					row={row}
					t={t}
					permissionsPending={permissions.isPending}
					updateDenied={updateDenied}
					triggerDenied={triggerDenied}
					explanation={explanation}
					onEditCron={actions.openCronDialog}
					onTriggerNow={actions.onTriggerNow}
				/>
			)}
			onExport={() => exportJobRows(rows, columns, t, 'jobs-export-system')}
			queryState={{
				isPending: query.isPending,
				isError: query.isError,
				onRetry: () => void query.refetch(),
			}}
			footer={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId="staff-jobs-system-table"
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
				<SystemCronDialog
					dialog={actions.cronDialog}
					isPending={actions.cronPending}
					onDraftChange={actions.updateDraft}
					onConfirm={actions.confirmCron}
					onOpenChange={(open) => {
						if (!open) {
							actions.closeCronDialog();
						}
					}}
					t={t}
				/>
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/jobs/system-jobs')({
	staticData: {
		i18nNamespaces: ['staff-jobs'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }],
	},
	validateSearch: (search) =>
		serializeStaffJobsListSearchParams(
			parseStaffJobsListSearchParams(search as StaffJobsListSearchParamInput),
		),
	component: StaffJobsSystemJobsPage,
});
