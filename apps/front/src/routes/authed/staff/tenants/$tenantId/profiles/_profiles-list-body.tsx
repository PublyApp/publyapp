import { IconShield } from '@tabler/icons-react';
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DataTable,
	DataTableCursorFooter,
	DataTableToolbar,
	SELECTION_LOCKED_TITLE_KEY,
} from '~/components/table/data-table';
import type { TableBodyState } from '~/components/table/table-body-state';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { UseTableControllerResult } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';
import type { StaffTenantProfileRow } from '~/lib/query/staff-tenant-profiles';

import { ProfileCard, ProfileCardGridSkeleton } from './_profile-card';
import type { StaffTenantProfilesViewMode } from './_profiles-search-params';

type ProfilesListBodyProps = {
	testId: string;
	tenantId: string;
	view: StaffTenantProfilesViewMode;
	columns: ColumnDef<StaffTenantProfileRow>[];
	rows: StaffTenantProfileRow[];
	controller: UseTableControllerResult;
	selection: UseRowSelectionResult;
	bodyState: TableBodyState;
	/** Grouped so the component does not take a fistful of loose on/off props
	 * (`react-doctor/no-many-boolean-props`). */
	queryState: {
		hasActiveSearch: boolean;
		isPending: boolean;
		isError: boolean;
		isFetching: boolean;
	};
	nextCursor: string | null | undefined;
	onRetry: () => void;
	onEditRequest: (profile: StaffTenantProfileRow) => void;
	onDeleteRequest: (profile: StaffTenantProfileRow) => void;
	onToggleCardSelection: (profileId: string) => void;
	toolbarEnd: ReactNode;
};

/** The table-or-cards region of the tenant profiles list. Split out of the
 * route file for `react-doctor/no-giant-component`; markup is unchanged. */
export const ProfilesListBody = ({
	testId,
	tenantId,
	view,
	columns,
	rows,
	controller,
	selection,
	bodyState,
	queryState,
	nextCursor,
	onRetry,
	onEditRequest,
	onDeleteRequest,
	onToggleCardSelection,
	toolbarEnd,
}: ProfilesListBodyProps) => {
	const { t } = useTranslation('common');
	const { hasActiveSearch, isPending, isError, isFetching } = queryState;

	if (view === 'table') {
		return (
			<DataTable<StaffTenantProfileRow>
				testId={testId}
				ariaLabel={t('tenant-profiles-table-aria-label')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: isPending,
					isError: isError,
					onRetry: onRetry,
					hasActiveSearch: hasActiveSearch,
				}}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: nextCursor != null,
					isPaginationPending: isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(nextCursor ?? undefined),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				getRowLabel={(row) => row.name}
				emptyIcon={IconShield}
				emptyContent={t('tenant-profiles-empty-description')}
				noMatchContent={t('tenant-profiles-no-match-description')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-profiles')}
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
				searchPlaceholder={t('search-profiles')}
				disabled={selection.isSelectionMode}
				disabledTitle={t(SELECTION_LOCKED_TITLE_KEY)}
				toolbarEnd={toolbarEnd}
			/>

			{bodyState === 'loading' ? (
				<ProfileCardGridSkeleton testId={testId} />
			) : null}

			{bodyState === 'error' ? (
				<ErrorStateSurface
					title={t('list-unavailable-title')}
					description={t('list-error-default-description')}
					actions={
						<Button type="button" variant="outline" onClick={onRetry}>
							{t('retry')}
						</Button>
					}
					testId={`${testId}-error`}
				/>
			) : null}

			{bodyState === 'empty' ? (
				<StateSurface
					title={t('list-empty-title')}
					description={t('tenant-profiles-empty-description')}
					testId={`${testId}-empty`}
				/>
			) : null}

			{bodyState === 'no-match' ? (
				<NoMatchStateSurface
					title={t('list-no-match-title')}
					description={t('tenant-profiles-no-match-description')}
					testId={`${testId}-no-match`}
				/>
			) : null}

			{bodyState === 'rows' ? (
				<>
					<div
						className="publy-profile-card-grid"
						data-testid={`${testId}-rows`}
					>
						{rows.map((profile) => (
							<ProfileCard
								key={profile.id}
								tenantId={tenantId}
								profile={profile}
								onEditRequest={onEditRequest}
								onDeleteRequest={onDeleteRequest}
								isSelected={Boolean(selection.rowSelection[profile.id])}
								isSelectionMode={selection.isSelectionMode}
								onToggleSelect={onToggleCardSelection}
							/>
						))}
					</div>
					<DataTableCursorFooter
						testId={testId}
						pageIndex={controller.cursor.pageIndex}
						size={controller.size}
						onSizeChange={controller.onSizeChange}
						hasPreviousPage={controller.cursor.hasPreviousPage}
						hasNextPage={nextCursor != null}
						isPaginationPending={isFetching}
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
