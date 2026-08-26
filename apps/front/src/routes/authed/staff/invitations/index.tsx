import { IconChevronDown, IconCircleDot, IconPlus } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { PageHeader } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { StaffListExportSelectedButton } from '~/routes/authed/staff/staff-list-export-selected';

import type { InvitationListItem } from '@org/client-ts/models/index';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { InvitationsListBulkActions } from './_list-bulk-actions';
import {
	getInvitationStatusLabelKey,
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationStatus,
	normalizeInvitationStatus,
	parseInvitationListSearchParams,
	parseInvitationStatusFilter,
	serializeInvitationListSearchParams,
	serializeInvitationStatusFilter,
	KNOWN_INVITATION_STATUSES,
} from './list-helpers';
import { createInvitationColumns, type InvitationRow } from './table-columns';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const toRows = (
	items: InvitationListItem[] | null | undefined,
): InvitationRow[] => {
	const list = items ?? [];
	const rows: InvitationRow[] = [];

	for (const item of list) {
		if (typeof item.id !== 'string' || item.id.length === 0) {
			continue;
		}

		rows.push({
			id: item.id,
			email: item.email ?? '',
			profileName: item.profileName?.trim() ?? '',
			invitedByName: item.invitedByName?.trim() ?? '',
			status: normalizeInvitationStatus(item.status),
			acceptedAt: item.acceptedAt ?? null,
			createdAt: item.createdAt ?? null,
			expiresAt: item.expiresAt ?? null,
		});
	}

	return rows;
};

const StaffInvitationsPage = () => {
	const navigate = Route.useNavigate();
	const search = Route.useSearch() as InvitationListSearchParams;
	const { t, i18n } = useTranslation(['staff-invitations', 'common']);
	// A bulk revoke hit an auth failure mid-session — log out through the same
	// central path as every other surface (mirrors the staff-users page).
	const [shouldLogout, setShouldLogout] = useState(false);

	const selectedStatuses = parseInvitationStatusFilter(search.status);

	const onSearchChange = (next: InvitationListSearchParams): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				...next,
				status: search.status,
			}) as InvitationListSearchParams,
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: search.status ?? '',
	});
	// users-auth-r6-F2: the API's FindStaffInvitations contract has no search
	// parameter (see apps/api/Modules/Invitations/Handlers/Staff/
	// FindStaffInvitations.cs) — `q` is never sent here, and the search input
	// is removed from the toolbar below, rather than rendering a text box
	// that silently filters nothing.
	const query = useStaffInvitationsQuery({
		...controller.apiVariables,
		status: search.status,
	});

	const columns = createInvitationColumns({
		t: (key, options) => t(key, options),
		locale: i18n.language,
	});
	const rows = toRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// the DataTable carries the loading/error slots (exempt from QueryDisplay).
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const setStatuses = (nextStatuses: KnownInvitationStatus[]): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				status: serializeInvitationStatusFilter(nextStatuses),
				cursor: undefined,
			}) as InvitationListSearchParams,
			replace: true,
		});
	};

	const toggleStatus = (status: KnownInvitationStatus): void => {
		if (selectedStatuses.includes(status)) {
			setStatuses(selectedStatuses.filter((value) => value !== status));
			return;
		}

		setStatuses([...selectedStatuses, status]);
	};

	const statusFilterLabel =
		selectedStatuses.length === 0
			? t('common:all-statuses')
			: selectedStatuses
					.map((status) => t(getInvitationStatusLabelKey(status)))
					.join(', ');

	return (
		<div className="publy-page-fill" data-testid="staff-invitations-list-page">
			<PageHeader
				title={t('common:staff-invitations')}
				description={t('invite-staff-users-to-the-platform')}
				actions={
					<Link
						to="/staff/invitations/new"
						className={buttonVariants({ variant: 'default' })}
					>
						<IconPlus aria-hidden="true" className="size-[15px]" />
						{t('invite-user')}
					</Link>
				}
			/>

			<DataTable
				toolbarEnd={
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									type="button"
									variant="outline"
									className="publy-data-table-filter-button max-w-64 text-[13px]"
								/>
							}
						>
							<IconCircleDot
								aria-hidden="true"
								className="size-[15px] text-[var(--publy-foreground-secondary)]"
							/>
							<span className="truncate">{statusFilterLabel}</span>
							<IconChevronDown aria-hidden="true" className="size-3" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6}>
							<DropdownMenuCheckboxItem
								checked={selectedStatuses.length === 0}
								closeOnClick
								onCheckedChange={() => setStatuses([])}
							>
								{t('common:all-statuses')}
							</DropdownMenuCheckboxItem>
							{KNOWN_INVITATION_STATUSES.map((status) => (
								<DropdownMenuCheckboxItem
									key={status}
									checked={selectedStatuses.includes(status)}
									closeOnClick={false}
									showCheckbox
									onCheckedChange={() => toggleStatus(status)}
								>
									{t(getInvitationStatusLabelKey(status))}
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				}
				testId="staff-invitations-table"
				ariaLabel={t('common:staff-invitations')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: selectedStatuses.length > 0,
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
				emptyContent={t('no-invitations-found')}
				noMatchContent={t('no-invitations-match-your-search')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				selection={selection}
			/>
			{/* ONE selection bar hosts every bulk action — a second stacked
				portalled bar would overlap the first (#820 extraction note). */}
			<FloatingSelectionBar
				selectedCount={selection.selectedCount}
				visibleCount={rows.length}
				allVisibleSelected={
					rows.length > 0 && rows.every((row) => selection.rowSelection[row.id])
				}
				onClear={selection.clearSelection}
				onSelectAllVisible={() =>
					selection.onSelectionChange(new Set(rows.map((row) => row.id)))
				}
			>
				<InvitationsListBulkActions
					rows={rows}
					selection={selection}
					onSessionExpired={() => setShouldLogout(true)}
				/>
				<StaffListExportSelectedButton
					rows={rows}
					selection={selection}
					fileNamePrefix="staff-invitations"
					columns={[
						{ header: t('common:invitee'), getValue: (row) => row.email },
						{
							header: t('common:profiles'),
							getValue: (row) => row.profileName,
						},
						{
							header: t('common:invited-by'),
							getValue: (row) => row.invitedByName,
						},
						{
							header: t('common:status'),
							getValue: (row) => t(getInvitationStatusLabelKey(row.status)),
						},
						{
							header: t('common:expires'),
							getValue: (row) => formatDateTime(row.expiresAt, i18n.language),
						},
					]}
				/>
			</FloatingSelectionBar>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/invitations')({
	validateSearch: (search) =>
		parseInvitationListSearchParams(search as InvitationListSearchParamInput),
	staticData: {
		i18nNamespaces: ['staff-invitations'],
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-invitations' }],
	},
	component: StaffInvitationsPage,
});
