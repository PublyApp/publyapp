import capitalize from 'lodash/capitalize';
import type { MRT_Localization, MRT_SortingState } from 'material-react-table';
import { useDebounce } from 'minimal-shared/hooks';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';

import type { TenantProfileItem } from '@org/client-ts/src/models';
import { DEFAULT_PAGE_SIZE } from '@org/shared-ts/lib/constants';

import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { useFindTenantProfiles } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import type { TenantProfileRowData } from './tenant-profiles-table.types.ts';

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const useTenantProfilesTableController = (tenantId: string) => {
	const { t } = useTranslate();

	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
	});
	const [searchValue, setSearchValue] = useState(filterStates.q);
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const debouncedSearchValue = useDebounce(searchValue, 300);

	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	useEffect(() => {
		if (debouncedSearchValue === filterStates.q) {
			return;
		}

		// Search changes invalidate the current cursor chain, so reset pagination before pushing
		// the new query state into the URL.
		resetCursorPagination?.();
		setFilterStates({ q: debouncedSearchValue });
	}, [
		debouncedSearchValue,
		filterStates.q,
		resetCursorPagination,
		setFilterStates,
	]);

	useEffect(() => {
		setSearchValue(filterStates.q);
	}, [filterStates.q]);

	const profilesQuery = useFindTenantProfiles({
		variables: {
			tenantId,
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
		},
		enabled: tenantId.length > 0,
	});

	useEffect(() => {
		setNextCursor?.(profilesQuery.data?.nextCursor);
	}, [profilesQuery.data?.nextCursor, setNextCursor]);

	const rows = useMemo<TenantProfileRowData[]>(() => {
		return (profilesQuery.data?.data ?? []).map(
			(profile: TenantProfileItem) => {
				return {
					id: profile.id?.toString() ?? '',
					name: profile.name || '-',
					description: profile.description || null,
					userAccountCount: profile.userAccountCount ?? 0,
					isDefault: profile.isDefault ?? false,
				};
			},
		);
	}, [profilesQuery.data]);

	useEffect(() => {
		if (profilesQuery.isFetching) {
			return;
		}

		// Keep selection scoped to visible rows so bulk actions never target profiles from an
		// older cursor page after search/sort changes reshuffle the table contents.
		const visibleRowIds = new Set(rows.map((row) => row.id));
		setRowSelection((prev) => {
			const nextEntries = Object.entries(prev).filter(
				([profileId, isSelected]) => {
					return isSelected && visibleRowIds.has(profileId);
				},
			);

			if (nextEntries.length === Object.keys(prev).length) {
				return prev;
			}

			return Object.fromEntries(nextEntries);
		});
	}, [profilesQuery.isFetching, rows]);

	const selectedRows = useMemo(() => {
		return rows.filter((row) => rowSelection[row.id]);
	}, [rowSelection, rows]);

	const selectedCount = Object.keys(rowSelection).length;
	const isSelectionMode = selectedCount > 0;
	const selectionModeDisabledReason = t('selection-mode-disable-controls');
	const sortingDisabledReason = t('selection-mode-disable-sorting');
	const sortTooltipLocalization = useMemo<Partial<MRT_Localization>>(() => {
		if (!isSelectionMode) {
			return {};
		}

		return {
			sortByColumnAsc: sortingDisabledReason,
			sortByColumnDesc: sortingDisabledReason,
			sortedByColumnAsc: sortingDisabledReason,
			sortedByColumnDesc: sortingDisabledReason,
		};
	}, [isSelectionMode, sortingDisabledReason]);

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: profilesQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', { item: t('profiles'), ns: 'response-message' }),
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('profiles'),
					ns: 'response-message',
				}),
			),
		},
	});

	const hasNextPage = profilesQuery.data?.nextCursor != null;

	const handleCursorPaginationChange: typeof handlePaginationChange = (
		updater,
	) => {
		// Snapshot the current page's next cursor before MRT mutates pagination state.
		setNextCursor?.(profilesQuery.data?.nextCursor);
		handlePaginationChange(updater);
	};

	return {
		handleCursorPaginationChange,
		handleSortingChange,
		hasNextPage,
		hasPreviousPage,
		isSelectionMode,
		profilesQuery,
		queryState,
		renderEmptyRowsFallback,
		rowSelection,
		rows,
		searchValue,
		selectedCount,
		selectedRows,
		selectionModeDisabledReason,
		setRowSelection,
		setSearchValue,
		sortTooltipLocalization,
		sortingDisabledReason,
		tableState,
	};
};

export default useTenantProfilesTableController;
