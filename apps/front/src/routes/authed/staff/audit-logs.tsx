import {
	IconActivity,
	IconAlertCircle,
	IconChevronDown,
	IconDownload,
	IconFilter,
	IconRefresh,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { PageHeader } from '~/components/ui/product-page';
import {
	toStaffAuditLogRows,
	useAuditLogActionsQuery,
	useStaffAuditLogsQuery,
	type StaffAuditLogRow,
} from '~/lib/query/staff-audit-logs';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { makeAuditLogColumns } from './audit-logs/_audit-log-columns';
import { AuditLogExportDrawer } from './audit-logs/_audit-log-export-drawer';
import {
	buildAuditLogsCursorResetKey,
	parseAuditLogsActionsFilter,
	parseAuditLogsListSearchParams,
	serializeAuditLogsActionsFilter,
	serializeAuditLogsListSearchParams,
	type AuditLogsListSearchParamInput,
	type AuditLogsListSearchParams,
} from './audit-logs/_list-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffAuditLogsPage = () => {
	const navigate = Route.useNavigate();
	const search = parseAuditLogsListSearchParams(
		Route.useSearch() as AuditLogsListSearchParamInput,
	);
	const { t, i18n } = useTranslation(['staff-audit-logs', 'common']);
	const locale = i18n?.language ?? 'en';
	const [isExportOpen, setIsExportOpen] = useState(false);
	const [shouldLogout, setShouldLogout] = useState(false);

	const selectedActions = parseAuditLogsActionsFilter(search.actions);
	// O(1) membership for the dropdown checkboxes; rebuilt per render from the
	// freshly-parsed filter, so it can never go stale.
	const selectedActionsFilter = new Set(selectedActions);

	const onSearchChange = (next: AuditLogsListSearchParams): void => {
		void navigate({
			search: serializeAuditLogsListSearchParams(next),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: buildAuditLogsCursorResetKey(search),
	});
	const query = useStaffAuditLogsQuery({
		actions: selectedActions,
		startDate: search.startDate,
		endDate: search.endDate,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = toStaffAuditLogRows(query.data?.data);
	const actionsQuery = useAuditLogActionsQuery();
	const columns = useMemo(() => makeAuditLogColumns(t, locale), [t, locale]);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// the DataTable carries the loading/error slots (exempt from QueryDisplay).
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const hasActiveFilters = Boolean(
		selectedActions.length > 0 || search.startDate || search.endDate,
	);

	const setActionsFilter = (next: string[]): void => {
		void navigate({
			search: serializeAuditLogsListSearchParams({
				...search,
				actions: serializeAuditLogsActionsFilter(next),
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const toggleAction = (action: string): void => {
		if (selectedActions.includes(action)) {
			setActionsFilter(selectedActions.filter((value) => value !== action));
			return;
		}

		setActionsFilter([...selectedActions, action]);
	};

	const actionFilterLabel =
		selectedActions.length === 0
			? t('all-actions')
			: selectedActions.join(', ');

	const setDateFilter = (key: 'startDate' | 'endDate', value: string): void => {
		const normalized = value.trim();
		void navigate({
			search: serializeAuditLogsListSearchParams({
				...search,
				[key]: normalized.length > 0 ? normalized : undefined,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const actionsOptions = actionsQuery.data?.actions ?? [];

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('audit-logs-page-title')}
				description={t('audit-logs-page-description')}
			/>
			<DataTable<StaffAuditLogRow>
				testId="staff-audit-logs-table"
				ariaLabel={t('audit-logs-page-title')}
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
				noMatchTitle={t('no-audit-logs-match-title')}
				noMatchContent={t('no-audit-logs-match-description')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				toolbarEnd={
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										type="button"
										variant="outline"
										className="publy-data-table-filter-button max-w-72 text-[13px]"
										data-testid="staff-audit-logs-actions-filter-trigger"
										disabled={actionsQuery.isPending}
										title={
											actionsQuery.isPending ? t('loading-actions') : undefined
										}
									/>
								}
							>
								<IconFilter
									aria-hidden="true"
									className="size-[15px] text-[var(--publy-foreground-secondary)]"
								/>
								<span className="truncate">{actionFilterLabel}</span>
								<IconChevronDown aria-hidden="true" className="size-3" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={6}>
								<DropdownMenuCheckboxItem
									checked={selectedActions.length === 0}
									closeOnClick
									data-testid="staff-audit-logs-actions-filter-all"
									onCheckedChange={() => setActionsFilter([])}
								>
									{t('all-actions')}
								</DropdownMenuCheckboxItem>
								{actionsQuery.isError ? (
									<>
										<div
											className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-destructive"
											data-testid="staff-audit-logs-actions-filter-error"
										>
											<IconAlertCircle
												aria-hidden="true"
												className="size-4 shrink-0"
											/>
											<span>{t('actions-filter-error')}</span>
										</div>
										<DropdownMenuItem
											data-testid="staff-audit-logs-actions-filter-retry"
											onClick={() => void actionsQuery.refetch()}
										>
											<IconRefresh aria-hidden="true" className="size-4" />
											{t('common:try-again')}
										</DropdownMenuItem>
									</>
								) : (
									actionsOptions.map((action) => (
										<DropdownMenuCheckboxItem
											key={action}
											checked={selectedActionsFilter.has(action)}
											closeOnClick={false}
											showCheckbox
											data-testid={`staff-audit-logs-actions-filter-${action}`}
											onCheckedChange={() => toggleAction(action)}
										>
											<span className="font-mono text-[13px]">{action}</span>
										</DropdownMenuCheckboxItem>
									))
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setActionsFilter([])}>
									{t('common:clear')}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<div
							className="flex items-center gap-1.5"
							data-testid="staff-audit-logs-date-range-filter"
						>
							<Input
								type="date"
								aria-label={t('common:start-date')}
								data-testid="staff-audit-logs-start-date"
								value={search.startDate ?? ''}
								max={search.endDate ?? undefined}
								onChange={(event) =>
									setDateFilter('startDate', event.target.value)
								}
								className="h-9 w-37"
							/>
							<span aria-hidden="true" className="text-muted-foreground">
								–
							</span>
							<Input
								type="date"
								aria-label={t('common:end-date')}
								data-testid="staff-audit-logs-end-date"
								value={search.endDate ?? ''}
								min={search.startDate ?? undefined}
								onChange={(event) =>
									setDateFilter('endDate', event.target.value)
								}
								className="h-9 w-37"
							/>
						</div>
						<Button
							type="button"
							variant="outline"
							data-testid="staff-audit-logs-export-trigger"
							onClick={() => setIsExportOpen(true)}
						>
							<IconDownload aria-hidden="true" className="size-[15px]" />
							{t('export')}
						</Button>
					</div>
				}
			/>
			<AuditLogExportDrawer
				isOpen={isExportOpen}
				onOpenChange={setIsExportOpen}
				onAuthFailure={() => setShouldLogout(true)}
				filters={{
					actions: selectedActions,
					startDate: search.startDate,
					endDate: search.endDate,
				}}
			/>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/audit-logs')({
	staticData: {
		i18nNamespaces: ['staff-audit-logs'],
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-audit-logs' }],
	},
	validateSearch: (search) =>
		serializeAuditLogsListSearchParams(
			parseAuditLogsListSearchParams(search as AuditLogsListSearchParamInput),
		),
	component: StaffAuditLogsPage,
});
