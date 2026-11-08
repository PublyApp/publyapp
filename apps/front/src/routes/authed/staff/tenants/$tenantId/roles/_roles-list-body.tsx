import { IconShield } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorKindState } from '~/components/error-views/error-kind-state';
import type { QueryDisplayQuery } from '~/components/query-display';
import type { ColumnDef } from '~/components/table/column-type';
import {
	DataTable,
	DataTableCursorFooter,
	DataTableToolbar,
	SELECTION_LOCKED_TITLE_KEY,
} from '~/components/table/data-table';
import type { TableBodyState } from '~/components/table/table-body-state';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { UseTableControllerResult } from '~/components/table/use-table-controller';
import {
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';
import type { StaffTenantRoleRow } from '~/lib/query/staff-tenant-roles';
import { resolveQueryError } from '~/lib/server/query-error-resolver';

import { RoleCard, RoleCardGridSkeleton } from './_role-card';
import type { StaffTenantRolesViewMode } from './_roles-search-params';

type RolesListBodyProps = {
	testId: string;
	tenantId: string;
	view: StaffTenantRolesViewMode;
	columns: ColumnDef<StaffTenantRoleRow>[];
	rows: StaffTenantRoleRow[];
	controller: UseTableControllerResult;
	selection: UseRowSelectionResult;
	bodyState: TableBodyState;
	query: QueryDisplayQuery;
	/** A committed search/filter is active; zero rows render "no matches". */
	hasActiveSearch: boolean;
	nextCursor: string | null | undefined;
	onEditRequest: (role: StaffTenantRoleRow) => void;
	onDeleteRequest: (role: StaffTenantRoleRow) => void;
	onToggleCardSelection: (roleId: string) => void;
	toolbarEnd: ReactNode;
};

/** The table-or-cards region of the tenant roles list. Split out of the
 * route file for `react-doctor/no-giant-component`; markup is unchanged. */
export const RolesListBody = ({
	testId,
	tenantId,
	view,
	columns,
	rows,
	controller,
	selection,
	bodyState,
	query,
	hasActiveSearch,
	nextCursor,
	onEditRequest,
	onDeleteRequest,
	onToggleCardSelection,
	toolbarEnd,
}: RolesListBodyProps) => {
	const { t } = useTranslation('common');
	// #2291: the card-grid branch owns its error surface (no DataTable), so it
	// resolves the same one-error-state copy: 5xx retries, 403 has no Retry.
	const queryError = query.error ?? undefined;
	const resolvedError =
		queryError === undefined ? undefined : resolveQueryError(queryError, t);

	if (view === 'table') {
		return (
			<DataTable<StaffTenantRoleRow>
				testId={testId}
				ariaLabel={t('tenant-roles-table-aria-label')}
				columns={columns}
				rows={rows}
				query={query}
				hasActiveSearch={hasActiveSearch}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: nextCursor != null,
					isPaginationPending: query.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(nextCursor ?? undefined),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				getRowLabel={(row) => row.name}
				emptyIcon={IconShield}
				emptyContent={t('tenant-roles-empty-description')}
				noMatchContent={t('tenant-roles-no-match-description')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-roles')}
				selection={selection}
				toolbarEnd={toolbarEnd}
			/>
		);
	}

	return (
		<div className="publy-data-table-shell">
			<DataTableToolbar
				testId={testId}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-roles')}
				disabled={selection.isSelectionMode}
				disabledTitle={t(SELECTION_LOCKED_TITLE_KEY)}
				toolbarEnd={toolbarEnd}
			/>

			{bodyState === 'loading' ? (
				<RoleCardGridSkeleton testId={testId} />
			) : null}

			{bodyState === 'error' ? (
				<ErrorKindState
					scale="inline"
					panel
					kind={resolvedError?.kind}
					error={queryError}
					onRetry={() => void query.refetch()}
					testId={`${testId}-error`}
				/>
			) : null}

			{bodyState === 'empty' ? (
				<StateSurface
					title={t('list-empty-title')}
					description={t('tenant-roles-empty-description')}
					testId={`${testId}-empty`}
				/>
			) : null}

			{bodyState === 'no-match' ? (
				<NoMatchStateSurface
					title={t('list-no-match-title')}
					description={t('tenant-roles-no-match-description')}
					testId={`${testId}-no-match`}
				/>
			) : null}

			{bodyState === 'rows' ? (
				<>
					<div className="publy-role-card-grid" data-testid={`${testId}-rows`}>
						{rows.map((role) => (
							<RoleCard
								key={role.id}
								tenantId={tenantId}
								role={role}
								onEditRequest={onEditRequest}
								onDeleteRequest={onDeleteRequest}
								isSelected={Boolean(selection.rowSelection[role.id])}
								isSelectionMode={selection.isSelectionMode}
								onToggleSelect={onToggleCardSelection}
							/>
						))}
					</div>
					<DataTableCursorFooter
						testId={testId}
						pageIndex={controller.cursor.pageIndex}
						size={controller.size}
						pageRowCount={rows.length}
						onSizeChange={controller.onSizeChange}
						hasPreviousPage={controller.cursor.hasPreviousPage}
						hasNextPage={nextCursor != null}
						isPaginationPending={query.isFetching}
						onNextPage={() =>
							controller.cursor.onNextPage(nextCursor ?? undefined)
						}
						onPreviousPage={controller.cursor.onPreviousPage}
						disabled={selection.isSelectionMode}
						disabledTitle={t(SELECTION_LOCKED_TITLE_KEY)}
						variant="flat"
					/>
				</>
			) : null}
		</div>
	);
};
