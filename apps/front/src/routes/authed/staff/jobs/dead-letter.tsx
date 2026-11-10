import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import {
	resolveSize,
	useTableController,
} from '~/components/table/use-table-controller';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	invalidateStaffJobsQueries,
	staffDeadLetterDetailsQueryOptions,
	staffDeadLettersQueryOptions,
	staffJobPermissionsQueryOptions,
	staffJobQueueQueryOptions,
	staffSystemJobDefinitionsQueryOptions,
	toStaffDeadLetterRows,
	useStaffDeadLettersQuery,
	useStaffRequeueDeadLetterMutation,
	type StaffDeadLetterRow,
} from '~/lib/query/staff-jobs';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { DeadLetterDrawer } from './_dead-letter-drawer';
import { DeadLetterRequeueDialog } from './_dead-letter-requeue-dialog';
import { jobLabel } from './_job-catalogue';
import {
	deadLetterColumns,
	deadLetterFilters,
	deadLetterMobileCard,
	deadLetterTotals,
	exportJobRows,
} from './_jobs-list-config';
import { buildJobFamilyCounts, useJobsOverview } from './_jobs-overview';
import {
	buildJobsPanelGroups,
	jobsSectionPath,
	type JobsSection,
} from './_jobs-panel';
import { DeadLetterRowActions } from './_jobs-row-actions';
import { JobsStatCards } from './_jobs-stat-cards';
import {
	buildStaffJobsCursorResetKey,
	parseStaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
	type StaffJobsListSearchParamInput,
	type StaffJobsListSearchParams,
} from './_list-search-params';
import { useStaffJobPermissions } from './_permissions';

const DEFAULT_SORT = { id: 'failed_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const splitFilter = (value: string | undefined): string[] =>
	value ? value.split(',') : [];

/** The page's queries, declared once: the loader warms them and the page reads
 * the same variables. The loader takes the first page (no cursor, decision 4).
 * The row-drawer detail query is not here: it is enabled only while a row is
 * open. `overviewDeadLetters`, `queue` and `systemJobs` feed `useJobsOverview`,
 * which reads each one's whole-collection counts (`size: 1`). */
const deadLetterQueries = ({
	search,
}: {
	search: StaffJobsListSearchParams;
}) => ({
	deadLetters: {
		options: staffDeadLettersQueryOptions,
		variables: {
			q: search.q,
			externalStateStatus: search.externalStateStatus,
			jobType: search.jobType,
			tenantId: search.tenantId,
			size: resolveSize(search, DEFAULT_SIZE),
		},
	},
	overviewDeadLetters: {
		options: staffDeadLettersQueryOptions,
		variables: { size: 1 },
	},
	queue: {
		options: staffJobQueueQueryOptions,
		variables: { size: 1 },
	},
	systemJobs: {
		options: staffSystemJobDefinitionsQueryOptions,
		variables: { size: 1 },
	},
	permissions: {
		options: staffJobPermissionsQueryOptions,
		variables: {},
	},
});

const StaffJobsDeadLetterPage = () => {
	const { t, i18n } = useTranslation(['staff-jobs', 'common']);
	const locale = i18n?.language ?? 'en';
	const queryClient = useQueryClient();
	const permissions = useStaffJobPermissions();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [inspected, setInspected] = useState<StaffDeadLetterRow | null>(null);
	const [requeueTarget, setRequeueTarget] = useState<StaffDeadLetterRow | null>(
		null,
	);
	const [requeueNote, setRequeueNote] = useState('');
	const [requeueError, setRequeueError] = useState<string | null>(null);

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

	const queries = deadLetterQueries({ search });
	const query = useStaffDeadLettersQuery({
		...queries.deadLetters.variables,
		// The cursor lives in React state, never in URL search (decision 4): the
		// loader warms the first page, the page adds its own cursor.
		cursor: controller.apiVariables.cursor,
	});
	const rows = toStaffDeadLetterRows(query.data?.data);
	const overview = useJobsOverview();
	const counts = query.data?.counts;
	const globalCounts = overview.deadLetterCounts;
	const filterCounts = {
		state: {
			open: globalCounts?.open ?? null,
			triaged: globalCounts?.triaged ?? null,
			requeued: globalCounts?.requeued ?? null,
		},
		family: buildJobFamilyCounts(
			globalCounts?.byJobType?.map((row) => ({
				key: row.jobType,
				count: row.count ?? 0,
			})),
		),
	};

	const detailQuery = useStaffDeadLetterDetailQuery(inspected?.id);
	const requeueMutation = useStaffRequeueDeadLetterMutation();

	const filtersValue: ListFiltersValue = {
		state: splitFilter(search.state),
		family: splitFilter(search.family),
	};
	const columns = deadLetterColumns(t, locale);

	const setFilters = (next: ListFiltersValue): void => {
		void navigate({
			search: serializeStaffJobsListSearchParams({
				...search,
				state: (next.state ?? []).join(',') || undefined,
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

	const closeRequeueDialog = (): void => {
		setRequeueTarget(null);
		setRequeueNote('');
		setRequeueError(null);
	};

	const confirmRequeue = async (): Promise<void> => {
		// An in-flight permission request (or a failed one) leaves the real
		// grant unknown: a click must not silently vanish.
		if (!requeueTarget || !permissions.canRequeue) {
			closeRequeueDialog();
			return;
		}

		try {
			await requeueMutation.mutateAsync({
				deadLetterId: requeueTarget.id,
				note: requeueNote,
			});
		} catch (error) {
			setRequeueError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
				}),
			);
			if (shouldLogoutForFailure(error)) {
				closeRequeueDialog();
				setShouldLogout(true);
			}
			return;
		}

		void invalidateStaffJobsQueries(queryClient);
		closeRequeueDialog();
	};

	// `totalCount`/`counts` describe the whole filtered collection (#2301).
	const countsKnown = query.data !== undefined;

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const permissionsDenied = permissions.loadError || !permissions.canRequeue;

	return (
		<ListPage
			testId="staff-jobs-dead-letter-table"
			ariaLabel={t('dl-page-title')}
			title={t('dl-page-title')}
			searchPlaceholder={t('jobs-search-placeholder')}
			rows={rows}
			columns={columns}
			defaultColumns={[
				'type',
				'what',
				'state',
				'org',
				'attempts',
				'error',
				'failedAt',
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
			filters={deadLetterFilters(t)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			countsKnown={countsKnown}
			emptyText={t('dl-empty-description')}
			locale={locale}
			cards={<JobsStatCards overview={overview} t={t} />}
			totals={deadLetterTotals(t, counts)}
			panelGroups={buildJobsPanelGroups({
				t,
				current: 'dead',
				overview,
				filterCounts,
				filters: deadLetterFilters(t),
				filtersValue,
				onSection,
				onShortcut,
			})}
			onOpen={(row) => setInspected(row)}
			openLabel={(row) =>
				t('common:list-open-row', { name: jobLabel(t, row.jobType) })
			}
			rowLabel={(row) => jobLabel(t, row.jobType)}
			mobileCard={deadLetterMobileCard(t)}
			renderActions={(row) => (
				<DeadLetterRowActions
					row={row}
					t={t}
					onInspect={setInspected}
					onRequeue={setRequeueTarget}
					permissionsPending={permissions.isPending}
					permissionsDenied={permissionsDenied}
					explanation={
						permissions.isPending
							? t('action-permission-checking')
							: t('action-permission-denied')
					}
				/>
			)}
			onExport={() => exportJobRows(rows, columns, t, 'jobs-export-dead')}
			query={query}
			footer={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId="staff-jobs-dead-letter-table"
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
				<>
					<DeadLetterRequeueDialog
						target={requeueTarget}
						note={requeueNote}
						error={requeueError}
						isPending={requeueMutation.isPending}
						onNoteChange={setRequeueNote}
						onConfirm={() => void confirmRequeue()}
						onOpenChange={(open) => {
							if (!open) {
								closeRequeueDialog();
							}
						}}
						t={t}
					/>
					<DeadLetterDrawer
						row={inspected}
						query={detailQuery}
						locale={locale}
						onClose={() => setInspected(null)}
						t={t}
					/>
				</>
			}
		/>
	);
};

/** Detail fetch is only meaningful while a row is open — keep it disabled
 * otherwise so opening the dashboard never fans out one request per row. */
const useStaffDeadLetterDetailQuery = (deadLetterId: string | undefined) => {
	// preload-exempt: enabled only while a row drawer is open
	return useQuery({
		queryKey: staffDeadLetterDetailsQueryOptions.queryKey({
			deadLetterId: deadLetterId ?? '',
		}),
		queryFn: () =>
			staffDeadLetterDetailsQueryOptions.fetcher({
				deadLetterId: deadLetterId ?? '',
			}),
		enabled: Boolean(deadLetterId),
	});
};

export const Route = createFileRoute('/_authed-layout/staff/jobs/dead-letter')({
	staticData: {
		i18nNamespaces: ['staff-jobs'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }],
	},
	validateSearch: (search) =>
		serializeStaffJobsListSearchParams(
			parseStaffJobsListSearchParams(search as StaffJobsListSearchParamInput),
		),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => {
		preloadRouteQueries(
			context.queryClient,
			deadLetterQueries({
				// `validateSearch` stores the wire shape (CSV filters); the page
				// re-parses it, so the loader does too.
				search: parseStaffJobsListSearchParams(
					deps as StaffJobsListSearchParamInput,
				),
			}),
		);
	},
	component: StaffJobsDeadLetterPage,
});
