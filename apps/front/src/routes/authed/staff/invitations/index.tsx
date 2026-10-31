import { IconPlus } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button.variants';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { StaffListExportSelectedButton } from '~/routes/authed/staff/staff-list-export-selected';
import { formatDateTime } from '~/utils/format-time';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { buildListSelection, selectedListIds } from '../_staff-list-selection';
import {
	buildStaffTeamPanelGroups,
	useStaffTeamOverview,
} from '../_staff-list-team';
import { invitationColumns } from './_invitations-list-columns';
import {
	buildInvitationFilters,
	buildInvitationMobileCard,
	buildInvitationTotals,
	DEFAULT_INVITATION_COLUMNS,
	exportInvitationRows,
} from './_invitations-list-config';
import { InvitationsStatCards } from './_invitations-list-stat-cards';
import { InvitationsListBulkActions } from './_list-bulk-actions';
import {
	getInvitationStatusLabelKey,
	parseInvitationListSearchParams,
	parseInvitationProfileFilter,
	parseInvitationStatusFilter,
	serializeInvitationListSearchParams,
	serializeInvitationProfileFilter,
	serializeInvitationStatusFilter,
	toStaffInvitationRows,
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationStatus,
} from './list-helpers';
import { InvitationRowActions } from './table-columns';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffInvitationsPage = () => {
	const { t, i18n } = useTranslation('common');
	const { t: tInvitations } = useTranslation('staff-invitations');
	const navigate = Route.useNavigate();
	const search = Route.useSearch() as InvitationListSearchParams;
	const [shouldLogout, setShouldLogout] = useState(false);
	const selectedStatuses = parseInvitationStatusFilter(search.status);
	const selectedProfiles = parseInvitationProfileFilter(search.profile);

	const onSearchChange = (next: InvitationListSearchParams): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				...next,
				status: search.status,
				profile: search.profile,
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
	// users-auth-r6-F2: FindStaffInvitations has no search parameter, so the
	// generic page renders no search field rather than one that does nothing.
	const query = useStaffInvitationsQuery({
		...controller.apiVariables,
		status: search.status,
	});
	const team = useStaffTeamOverview();

	const rows = toStaffInvitationRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const listSelection = buildListSelection(
		rows,
		selection,
		controller.search.resetDraftToCommitted,
	);
	const selectedIds = selectedListIds(rows, selection);

	// No total count on the cursor endpoint: the three cards use the team
	// overview query, and the table's totals/panel counts stay « — » unless
	// the loaded page is the whole collection and no status filter narrowed it.
	const collectionComplete =
		query.data !== undefined &&
		query.data.nextCursor == null &&
		!controller.cursor.hasPreviousPage;
	const countsKnown = collectionComplete && selectedStatuses.length === 0;

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const navigateToTeam = useCallback(
		(
			toBe:
				| '/staff/staff-users'
				| '/staff/invitations'
				| '/staff/profiles'
				| '/staff/audit-logs',
		) => {
			void navigate({ to: toBe });
		},
		[navigate],
	);

	const filtersValue: ListFiltersValue = {
		status: selectedStatuses,
		profile: selectedProfiles,
	};

	const setFilters = (next: ListFiltersValue): void => {
		selection.clearSelection();
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				status: serializeInvitationStatusFilter(
					(next.status ?? []) as KnownInvitationStatus[],
				),
				profile: serializeInvitationProfileFilter(next.profile ?? []),
				cursor: undefined,
			}) as InvitationListSearchParams,
			replace: true,
		});
	};

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<ListPage
			testId="staff-invitations-table"
			ariaLabel={t('staff-invitations')}
			title={t('invitations')}
			description={tInvitations('invite-staff-users-to-the-platform')}
			rows={rows}
			columns={invitationColumns(t, i18n.language)}
			defaultColumns={[...DEFAULT_INVITATION_COLUMNS]}
			lockedColumn="email"
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
			onSearch={() => undefined}
			filters={buildInvitationFilters(t, rows, selectedProfiles)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			countsKnown={countsKnown}
			emptyText={tInvitations('no-invitations-found')}
			locale={i18n.language}
			cards={
				<InvitationsStatCards
					rows={team.invitations}
					t={t}
					known={team.counts.invitations !== null}
				/>
			}
			totals={buildInvitationTotals(t)}
			panelGroups={buildStaffTeamPanelGroups(
				t,
				'invitations',
				team.counts,
				navigateToTeam,
			)}
			onOpen={(row) =>
				void navigate({
					to: '/staff/invitations/$invitationId',
					params: { invitationId: row.id },
				})
			}
			openLabel={(row) =>
				t('list-open-row', {
					name: row.email || t('invitation'),
				})
			}
			rowLabel={(row) => row.email || row.id}
			mobileCard={buildInvitationMobileCard(t, i18n.language)}
			selection={listSelection}
			renderActions={(row) => <InvitationRowActions row={row} />}
			onExport={() => exportInvitationRows(rows, t, i18n.language)}
			newAction={
				<Link to="/staff/invitations/new" className={buttonVariants()}>
					<IconPlus aria-hidden="true" data-icon="inline-start" />
					{t('invite-member')}
				</Link>
			}
			queryState={{
				isPending: query.isPending,
				isError: query.isError,
				onRetry: () => void query.refetch(),
			}}
			footer={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId="staff-invitations-table"
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
			bulkBar={
				<FloatingSelectionBar
					selectedCount={selection.selectedCount}
					visibleCount={rows.length}
					allVisibleSelected={
						rows.length > 0 && selectedIds.size === rows.length
					}
					onClear={selection.clearSelection}
					onSelectAllVisible={() =>
						selection.onSelectionChange(new Set(rows.map((row) => row.id)))
					}
				>
					<InvitationsListBulkActions
						rows={rows}
						selection={selection}
						onSessionExpired={onSessionExpired}
					/>
					<StaffListExportSelectedButton
						rows={rows}
						selection={selection}
						fileNamePrefix="staff-invitations"
						columns={[
							{ header: t('invitee'), getValue: (row) => row.email },
							{ header: t('profiles'), getValue: (row) => row.profileName },
							{
								header: t('invited-by'),
								getValue: (row) => row.invitedByName,
							},
							{
								header: t('status'),
								getValue: (row) => t(getInvitationStatusLabelKey(row.status)),
							},
							{
								header: t('expires'),
								getValue: (row) => formatDateTime(row.expiresAt, i18n.language),
							},
						]}
					/>
				</FloatingSelectionBar>
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/invitations')({
	validateSearch: (search) =>
		parseInvitationListSearchParams(search as InvitationListSearchParamInput),
	staticData: {
		i18nNamespaces: ['staff-invitations'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-invitations' }],
	},
	component: StaffInvitationsPage,
});
