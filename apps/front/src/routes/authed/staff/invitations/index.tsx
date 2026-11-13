import { IconPlus } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { FilterCounts } from '~/components/list/filter-menu';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import {
	buildTableApiVariables,
	useTableController,
} from '~/components/table/use-table-controller';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import { staffInvitationsQueryOptions } from '~/lib/query/staff-invitations';
import { StaffListExportSelectedButton } from '~/routes/authed/staff/staff-list-export-selected';
import { formatDateTime } from '~/utils/format-time';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { buildListSelection, selectedListIds } from '../_staff-list-selection';
import {
	buildStaffTeamPanelGroups,
	useStaffTeamOverview,
} from '../_staff-list-team';
import {
	ROLES_LOOKUP_VARIABLES,
	staffRolesQueryOptions,
	useInvitationsListQuery,
	useRolesLookup,
} from './_invitations-data';
import { invitationColumns } from './_invitations-list-columns';
import {
	buildInvitationFilters,
	buildInvitationMobileCard,
	buildInvitationTotals,
	DEFAULT_INVITATION_COLUMNS,
	type InvitationRoleChoice,
	exportInvitationRows,
} from './_invitations-list-config';
import { InvitationsStatCards } from './_invitations-list-stat-cards';
import { InvitationsListBulkActions } from './_list-bulk-actions';
import {
	getInvitationStatusLabelKey,
	parseInvitationListSearchParams,
	parseInvitationRoleFilter,
	parseInvitationStatusFilter,
	serializeInvitationListSearchParams,
	serializeInvitationRoleFilter,
	serializeInvitationStatusFilter,
	toStaffInvitationRows,
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationStatus,
} from './list-helpers';
import { InvitationRowActions } from './table-columns';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const ROLE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page's list query, declared once: the loader warms it and the page reads
 * the same variables. The loader takes the first page (no cursor, decision 4). */
const staffInvitationsQueries = ({
	search,
}: {
	search: InvitationListSearchParams;
}) => ({
	invitations: {
		options: staffInvitationsQueryOptions,
		variables: {
			...buildTableApiVariables(search, DEFAULT_SORT, DEFAULT_SIZE),
			status: search.status,
			// Role ids (CSV), filtered by the API so it spans every page.
			// Only well-formed ids: an old bookmark holding a role name must not
			// turn the whole list into a 422.
			roleId:
				parseInvitationRoleFilter(search.role)
					.filter((value) => ROLE_ID_PATTERN.test(value))
					.join(',') || undefined,
		},
	},
	roles: {
		options: staffRolesQueryOptions,
		variables: ROLES_LOOKUP_VARIABLES,
	},
});

/** A role filter value against the full roles list: a legacy name becomes its
 * id, an id whose role is gone (or a name no role carries) resolves to nothing.
 * Until the list has loaded (a failed lookup) ids are kept as they are. */
const resolveRoleValue = (
	value: string,
	roles: readonly { id?: string | null; name?: string | null }[],
	rolesLoaded: boolean,
): string | undefined => {
	if (ROLE_ID_PATTERN.test(value)) {
		if (!rolesLoaded || roles.some((role) => role.id === value)) {
			return value;
		}
		return undefined;
	}
	const wanted = value.toLowerCase();
	return (
		roles.find((role) => role.name?.trim().toLowerCase() === wanted)?.id ??
		undefined
	);
};

const StaffInvitationsPage = () => {
	const { t, i18n } = useTranslation('common');
	const { t: tInvitations } = useTranslation('staff-invitations');
	const navigate = Route.useNavigate();
	const search = Route.useSearch() as InvitationListSearchParams;
	const [shouldLogout, setShouldLogout] = useState(false);
	const selectedStatuses = parseInvitationStatusFilter(search.status);
	const selectedRoleValues = parseInvitationRoleFilter(search.role);
	// Ids are the filter; a name is a legacy `?role=Writer` link, resolved below.
	const selectedRoles = selectedRoleValues.filter((value) =>
		ROLE_ID_PATTERN.test(value),
	);
	const hasLegacyRoleName = selectedRoleValues.length > selectedRoles.length;
	// Every staff role (not the q/status-narrowed facet): the source of truth for
	// names and for whether an id still exists. Warmed by the route loader.
	const rolesLookup = useRolesLookup();
	// While a name is unresolved the list would be the unfiltered one: hold it.
	const isResolvingRole = hasLegacyRoleName && !rolesLookup.settled;

	const onSearchChange = (next: InvitationListSearchParams): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				...next,
				status: search.status,
				role: search.role,
			}) as InvitationListSearchParams,
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		// Every server-side filter resets the cursor: a page-2 cursor sent with a
		// new filter would skip into the middle of the filtered collection.
		cursorResetKey: `${search.status ?? ''}:${search.role ?? ''}`,
	});
	const queries = staffInvitationsQueries({ search });
	const listVariables = {
		...queries.invitations.variables,
		// The cursor lives in React state, never in URL search (decision 4): the
		// loader warms the first page, the page adds its own cursor.
		cursor: controller.apiVariables.cursor,
	};
	const query = useInvitationsListQuery(listVariables, isResolvingRole);
	// The overview publishes these variables as the counter only while they
	// carry no filter/search; it owns that guard (see `_staff-list-team.tsx`).
	const team = useStaffTeamOverview({ invitations: listVariables });

	const rows = toStaffInvitationRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const listSelection = buildListSelection(
		rows,
		selection,
		controller.search.resetDraftToCommitted,
	);
	const selectedIds = selectedListIds(rows, selection);

	// `totalCount`/`counts` cover the whole filtered collection (issue #2301).
	const countsKnown = query.data !== undefined;
	// The role facet is the API's whole-collection `counts.roleCounts` (an
	// invitation holding several roles counts once in each), not the page.
	const apiRoleCounts = query.data?.counts?.roleCounts;
	const roleChoices: InvitationRoleChoice[] | null =
		apiRoleCounts === undefined || apiRoleCounts === null
			? null
			: apiRoleCounts.map((role) => ({
					id: role.roleId ?? '',
					name: role.name ?? '',
					count: role.count ?? 0,
				}));
	const roleCounts: Record<string, number> | null =
		roleChoices === null
			? null
			: Object.fromEntries(roleChoices.map((role) => [role.id, role.count]));

	// A selected id's name comes from the full roles list, so it stays put while
	// its request loads and when another filter drops it from the facet.
	const roleNames = new Map<string, string>(
		rolesLookup.roles.flatMap((role) =>
			role.id ? [[role.id, role.name ?? ''] as const] : [],
		),
	);

	// Normalise the role filter against the full roles list once it has loaded:
	// a legacy name becomes its id, a name no role carries is dropped, and an id
	// whose role is gone is dropped too (a failed lookup keeps the ids as is).
	const roleValuesKey = selectedRoleValues.join(',');
	useEffect(() => {
		if (!rolesLookup.settled || roleValuesKey.length === 0) {
			return;
		}
		const values = roleValuesKey.split(',');
		const next: string[] = [];
		for (const value of values) {
			const id = resolveRoleValue(value, rolesLookup.roles, rolesLookup.loaded);
			if (id !== undefined && !next.includes(id)) {
				next.push(id);
			}
		}
		if (next.join(',') === roleValuesKey) {
			return;
		}
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				role: serializeInvitationRoleFilter(next),
				cursor: undefined,
			}) as InvitationListSearchParams,
			replace: true,
		});
		// `search` is read at fire time; the role values and the lookup are the
		// triggers.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		roleValuesKey,
		rolesLookup.settled,
		rolesLookup.loaded,
		rolesLookup.roles,
	]);

	const listCounts: FilterCounts = {
		status: {
			pending: team.invitationCounts?.pending ?? null,
			accepted: team.invitationCounts?.accepted ?? null,
			expired: team.invitationCounts?.expired ?? null,
			revoked: team.invitationCounts?.revoked ?? null,
		},
	};
	if (roleCounts !== null) {
		listCounts.role = roleCounts;
	}

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const navigateToTeam = useCallback(
		(
			toBe:
				| '/staff/staff-users'
				| '/staff/invitations'
				| '/staff/roles'
				| '/staff/audit-logs',
		) => {
			void navigate({ to: toBe });
		},
		[navigate],
	);

	const filtersValue: ListFiltersValue = {
		status: selectedStatuses,
		role: selectedRoles,
	};

	const setFilters = (next: ListFiltersValue): void => {
		selection.clearSelection();
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				status: serializeInvitationStatusFilter(
					(next.status ?? []) as KnownInvitationStatus[],
				),
				role: serializeInvitationRoleFilter(next.role ?? []),
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
			searchPlaceholder={t('common:search-invitations')}
			q={search.q ?? ''}
			onSearch={(next) => {
				if (selection.selectedCount > 0) {
					return;
				}
				onSearchChange({ ...search, q: next, cursor: undefined });
			}}
			filters={buildInvitationFilters(
				t,
				selectedRoles,
				roleChoices,
				roleNames,
				rolesLookup.settled,
			)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			counts={listCounts}
			countsKnown={countsKnown}
			emptyText={tInvitations('no-invitations-found')}
			locale={i18n.language}
			cards={<InvitationsStatCards counts={team.invitationCounts} t={t} />}
			totals={buildInvitationTotals(t, query.data?.counts)}
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
			newAction={{
				label: t('invite-member'),
				icon: IconPlus,
				to: '/staff/invitations/new',
			}}
			query={query}
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
							{ header: t('roles'), getValue: (row) => row.roleName },
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
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => {
		preloadRouteQueries(
			context.queryClient,
			staffInvitationsQueries({ search: deps }),
		);
	},
	staticData: {
		i18nNamespaces: ['staff-invitations'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-invitations' }],
	},
	component: StaffInvitationsPage,
});
