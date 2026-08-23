import {
	IconActivity,
	IconAlertCircle,
	IconCalendarClock,
	IconChevronDown,
	IconDownload,
	IconEye,
	IconFilter,
	IconRefresh,
	IconTarget,
	IconUser,
	IconWorld,
} from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
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
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import {
	toStaffAuditLogRows,
	useAuditLogActionsQuery,
	useStaffAuditLogsQuery,
	type StaffAuditLogRow,
} from '~/lib/query/staff-audit-logs';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	auditActionKindLabel,
	categorizeAuditAction,
} from './audit-logs/_audit-log-action-category';
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

export const makeAuditLogColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
): ColumnDef<StaffAuditLogRow>[] => [
	{
		id: 'event',
		header: t('common:event'),
		enableSorting: false,
		meta: { headerIcon: <IconActivity />, width: '240px' },
		cell: ({ row }) => {
			const { kind, tone } = categorizeAuditAction(row.original.action);

			return (
				<div className="min-w-0">
					<div className="mb-1">
						<StatusPill tone={tone}>{auditActionKindLabel(t, kind)}</StatusPill>
					</div>
					<Link
						to="/staff/audit-logs/$logId"
						params={{ logId: row.original.id }}
						className="publy-record-link block truncate font-mono text-[13px] font-medium no-underline"
						title={row.original.action ?? undefined}
					>
						{/* data-honesty-ignore: a legacy audit row's missing action key renders as a no-value dash, not fabricated identity data */}
						{row.original.action || '-'}
					</Link>
					<span
						className="block truncate font-mono text-xs text-muted-foreground"
						title={row.original.id}
					>
						{row.original.id}
					</span>
				</div>
			);
		},
	},
	{
		id: 'user',
		header: t('common:user'),
		enableSorting: false,
		meta: { headerIcon: <IconUser />, width: '220px', hideBelow: 768 },
		cell: ({ row }) => (
			<div className="min-w-0">
				<span
					className="block truncate font-normal"
					title={row.original.userName ?? undefined}
				>
					{/* data-honesty-ignore: a deleted user's identity is genuinely absent, so the no-value dash is not fabricated identity data */}
					{row.original.userName || '-'}
				</span>
				<span
					className="block truncate text-xs text-muted-foreground"
					title={row.original.userEmail ?? undefined}
				>
					{/* data-honesty-ignore: a deleted user's identity is genuinely absent, so the no-value dash is not fabricated identity data */}
					{row.original.userEmail || '-'}
				</span>
			</div>
		),
	},
	{
		id: 'target-id',
		header: t('common:target-id'),
		accessorKey: 'targetId',
		enableSorting: false,
		meta: { headerIcon: <IconTarget />, width: '160px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const targetId = getValue<string | null>();
			return (
				<span
					className="block max-w-35 truncate font-mono text-xs text-muted-foreground"
					title={targetId ?? undefined}
				>
					{/* data-honesty-ignore: target id is a documented OPTIONAL field — an event without a target has none, not fabricated identity data */}
					{targetId || '-'}
				</span>
			);
		},
	},
	{
		id: 'ip-address',
		header: t('common:ip-address'),
		accessorKey: 'ipAddress',
		enableSorting: false,
		meta: { headerIcon: <IconWorld />, width: '140px', hideBelow: 768 },
		cell: ({ getValue }) => (
			<span className="block truncate font-mono text-xs text-muted-foreground">
				{/* data-honesty-ignore: ip address is a documented OPTIONAL field — a server-side event has none, not fabricated identity data */}
				{getValue<string | null>() || '-'}
			</span>
		),
	},
	{
		id: 'created_at',
		header: t('common:created-at'),
		accessorKey: 'createdAt',
		meta: { headerIcon: <IconCalendarClock />, width: '200px' },
		cell: ({ getValue }) => {
			const createdAt = getValue<Date | null>();
			return (
				<span className="block truncate font-normal">
					{formatDateTime(createdAt, locale)}
				</span>
			);
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('common:actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<DataTableRowActions
				ariaLabel={t('common:actions-for', {
					name: row.original.action ?? row.original.id,
				})}
				testId={`staff-audit-log-actions-${row.original.id}`}
			>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/audit-logs/$logId"
							params={{ logId: row.original.id }}
						/>
					}
				>
					<IconEye />
					{t('common:view-details')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];

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

	if (query.isError && shouldLogoutForFailure(query.error)) {
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
				isPending={query.isPending}
				isError={query.isError}
				onRetry={() => void query.refetch()}
				emptyIcon={IconActivity}
				emptyTitle={t('common:no-audit-logs-yet')}
				emptyContent={t('common:no-audit-logs-description')}
				noMatchTitle={t('no-audit-logs-match-title')}
				noMatchContent={t('no-audit-logs-match-description')}
				hasActiveSearch={hasActiveFilters}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={query.data?.nextCursor != null}
				isPaginationPending={query.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(query.data?.nextCursor ?? undefined)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
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
