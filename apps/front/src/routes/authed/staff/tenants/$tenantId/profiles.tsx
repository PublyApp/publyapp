import {
	IconAlertCircle,
	IconChevronDown,
	IconEye,
	IconFilter,
	IconLayoutGrid,
	IconPencil,
	IconPlus,
	IconShield,
	IconTable,
	IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
	createFileRoute,
	Link,
	useBlocker,
	useRouter,
} from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	DataTable,
	DataTableCursorFooter,
	DataTableToolbar,
	SELECTION_LOCKED_TITLE_KEY,
} from '~/components/table/data-table';
import {
	FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME,
	FloatingSelectionBar,
} from '~/components/table/floating-selection-bar';
import { DataTableRowActions } from '~/components/table/row-actions';
import { resolveTableBodyState } from '~/components/table/table-body-state';
import {
	useRowSelection,
	type UseRowSelectionResult,
} from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Skeleton } from '~/components/ui/skeleton';
import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	toStaffTenantProfileBulkActionSummary,
	toStaffTenantProfileRows,
	useBulkDeleteStaffTenantProfilesMutation,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantProfilesQuery,
	type StaffTenantProfileRow,
} from '~/lib/query/staff-tenant-profiles';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { cn } from '~/lib/utils';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';
import { deriveTenantProfileCardStyle } from './profiles/_profile-card-style';
import { ProfileEditDetailsDrawer } from './profiles/_profile-edit-details-drawer';
import { ProfileFormDrawer } from './profiles/_profile-form-drawer';

export { deriveTenantProfileCardStyle } from './profiles/_profile-card-style';

export type StaffTenantProfileTypeFilter = 'true' | 'false';
export type StaffTenantProfilesViewMode = 'cards' | 'table';

export type StaffTenantProfilesSearchParams = TableSearchParams & {
	new?: 1;
	/** Id of the profile whose quick-edit drawer is open OVER this list (#972).
	 * It is an id rather than a boolean flag because the list is the thing that
	 * stays mounted: the id names which row the drawer is editing, and putting
	 * it in the list's own search state keeps the drawer deep-linkable and
	 * makes a browser Back close it instead of leaving the list. */
	edit?: string;
	/** Snake_case + a REAL boolean: this object IS the route search state the
	 * router serializes into the URL — a camelCase key would leak into the URL,
	 * and a 'true' STRING would be JSON-quoted (`?is_default=%22true%22`). */
	is_default?: boolean;
	view?: 'table';
};
export type StaffTenantProfilesSearchParamInput = TableSearchParamInput & {
	new?: unknown;
	edit?: unknown;
	is_default?: unknown;
	view?: unknown;
};

const normalizeUnknownString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const toStaffTenantProfileTypeFilterString = (
	value: boolean | undefined,
): StaffTenantProfileTypeFilter | undefined => {
	if (value === undefined) {
		return undefined;
	}

	return value ? 'true' : 'false';
};

export const parseStaffTenantProfileTypeFilter = (
	value: unknown,
): boolean | undefined => {
	if (typeof value === 'boolean') {
		return value;
	}

	const normalized = normalizeUnknownString(value)?.toLowerCase();
	if (normalized === 'true') {
		return true;
	}

	return normalized === 'false' ? false : undefined;
};

/**
 * The `edit` param carries a profile id, so it must survive the URL as a RAW
 * string. TanStack's search serializer re-quotes any string that happens to be
 * valid JSON (`'5'` → `?edit=%225%22`) and its parser turns an unquoted numeric
 * value back into a NUMBER — so an all-digit value cannot round-trip. Profile
 * ids are UUIDs and never all-digit, so accepting strings only is both exact
 * and lossless; anything else (a number, a boolean, an empty string) is not an
 * id and is dropped at the router boundary.
 */
export const parseStaffTenantProfileEditId = (
	value: unknown,
): string | undefined => normalizeUnknownString(value);

/**
 * `?new=1` and `?edit=<id>` are both drawer-open flags on this one route, and a
 * drawer is a modal — two mounted at once is not a state this UI has a meaning
 * for (two stacked surfaces, two "Profile name" fields, one shared discard
 * prompt). Enforcing that only at the open call sites would leave
 * `?new=1&edit=<id>` — a link anyone can be sent — mounting both on first
 * paint, so the invariant is resolved HERE, at the same boundary that already
 * drops a non-string `edit`.
 *
 * **`edit` wins.** It names a specific existing row, so it is the flag that
 * carries information the URL cannot reconstruct: honouring `new` instead would
 * silently change *which* entity the recipient of the link is looking at. `new`
 * is a bare flag whose entire state is "open the empty create form", one click
 * away and identical every time. Dropping the cheap, reconstructible flag is
 * the smaller loss. (The reachable in-app flows never reach this tiebreak —
 * both open paths clear the opposite flag — so this governs hand-written,
 * stale, or shared URLs only.)
 */
export const resolveStaffTenantProfileDrawerFlags = (
	isCreateOpen: boolean,
	editProfileId: string | undefined,
): { new?: 1; edit?: string } => ({
	new: isCreateOpen && editProfileId === undefined ? (1 as const) : undefined,
	edit: editProfileId,
});

export const parseStaffTenantProfilesViewMode = (
	value: unknown,
): StaffTenantProfilesViewMode =>
	normalizeUnknownString(value)?.toLowerCase() === 'table' ? 'table' : 'cards';

export const parseStaffTenantProfilesSearchParams = (
	search: StaffTenantProfilesSearchParamInput,
): StaffTenantProfilesSearchParams => {
	const base = parseTableSearchParams(search);
	/* The flag round-trips as the NUMBER 1 — a string '1' would be JSON-quoted
	 * in the URL (`?new=%221%22`) by the router's search serializer. */
	const isCreateOpen =
		search.new === 1 ||
		(typeof search.new === 'string' && search.new.trim() === '1');
	const isDefault = parseStaffTenantProfileTypeFilter(search.is_default);
	const view = parseStaffTenantProfilesViewMode(search.view);

	return {
		...base,
		...resolveStaffTenantProfileDrawerFlags(
			isCreateOpen,
			parseStaffTenantProfileEditId(search.edit),
		),
		is_default: isDefault,
		view: view === 'table' ? view : undefined,
	};
};

export const serializeStaffTenantProfilesSearchParams = (
	params: StaffTenantProfilesSearchParams,
): Record<string, string | number | boolean | undefined> => {
	const next = serializeTableSearchParams(params);
	const isDefault = parseStaffTenantProfileTypeFilter(params.is_default);
	const view = parseStaffTenantProfilesViewMode(params.view);

	return {
		...next,
		...resolveStaffTenantProfileDrawerFlags(
			params.new === 1,
			parseStaffTenantProfileEditId(params.edit),
		),
		is_default: isDefault,
		view: view === 'table' ? view : undefined,
	};
};

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

export const tenantProfileTypeChipClassName = (isDefault: boolean): string =>
	isDefault
		? 'publy-detail-chip publy-detail-chip--amber'
		: 'publy-detail-chip publy-detail-chip--outline';

const StaffTenantProfilesPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseStaffTenantProfilesSearchParams(
		Route.useSearch() as StaffTenantProfilesSearchParamInput,
	);
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [deleteTarget, setDeleteTarget] =
		useState<StaffTenantProfileRow | null>(null);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const deleteProfile = useDeleteStaffTenantProfileMutation();
	const [isCreateFormDirty, setIsCreateFormDirty] = useState(false);
	const [isEditFormDirty, setIsEditFormDirty] = useState(false);

	const isCreateDrawerOpen = search.new === 1;
	const editProfileId = search.edit;

	// `onDirtyChange(false)` (called by the drawer right before an
	// app-initiated close/submit navigation) is an async React state update —
	// a `navigate()` fired synchronously right after it still sees the old
	// (dirty) render's `shouldBlockFn` closure. This ref is set synchronously
	// by every app-initiated close/navigate path below so the guard never
	// blocks its own transition (W8-DRAWER; only a real browser Back or
	// sibling-route nav should ever trip it).
	const createDrawerNavBypassRef = useRef(false);
	const editDrawerNavBypassRef = useRef(false);
	// Opening the edit drawer PUSHES a history entry (see `openEditDrawer`), so
	// a browser Back closes it and lands back on this exact list entry. Closing
	// it from inside the app must therefore consume that entry rather than
	// stack a third one — otherwise the first Back after an open/close round
	// trip would be a dead press that just re-lands on the list. A drawer
	// opened by a deep link has no entry of ours to consume and is closed with
	// a `replace` instead.
	const editDrawerPushedHistoryRef = useRef(false);
	const router = useRouter();

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeStaffTenantProfilesSearchParams(
				next,
			) as unknown as TableSearchParams,
			replace: true,
		});
	};

	const setCreateDrawerOpen = (isOpen: boolean): void => {
		// Opening re-arms the guard for the new draft; every close here is
		// either a not-dirty close or a discard the drawer already confirmed.
		createDrawerNavBypassRef.current = !isOpen;
		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...search,
				new: isOpen ? 1 : undefined,
				// The two drawers are mutually exclusive, and the boundary above
				// resolves a both-flags URL in `edit`'s favour — so this is not
				// belt-and-braces: without it, "New profile" while the edit drawer
				// is open would produce `?new=1&edit=<id>`, which canonicalizes
				// straight back to `?edit=<id>` and makes the button a no-op.
				edit: isOpen ? undefined : search.edit,
			}) as unknown as TableSearchParams,
			replace: true,
		});
	};

	// A PUSH, deliberately — unlike every other search write on this page. The
	// open drawer is its own history entry, so a browser Back closes it and
	// restores this list entry (same filters, same cursor page, same selection,
	// same scroll) instead of leaving the list (#972).
	const openEditDrawer = (profile: StaffTenantProfileRow): void => {
		editDrawerNavBypassRef.current = false;
		editDrawerPushedHistoryRef.current = true;
		// react-doctor: this handler only ever runs from event callbacks
		// (`onEditRequest`), never during render — the rule cannot see the
		// call sites, so the hydration concern does not apply here.
		// eslint-disable-next-line react-doctor/tanstack-start-no-navigate-in-render
		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...search,
				edit: profile.id,
				// Mutually exclusive with the create drawer — cleared here so the
				// pushed URL is right on its own, not only after the boundary
				// canonicalizes it.
				new: undefined,
			}) as unknown as TableSearchParams,
		});
	};

	const closeEditDrawer = (): void => {
		// Every close routed through here is either a not-dirty close, a
		// discard the drawer already confirmed, or a successful save — none of
		// them may be blocked by this page's own guard reading a not-yet-flushed
		// dirty flag (W8-DRAWER).
		editDrawerNavBypassRef.current = true;

		if (editDrawerPushedHistoryRef.current) {
			editDrawerPushedHistoryRef.current = false;
			router.history.back();
			return;
		}

		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...search,
				edit: undefined,
			}) as unknown as TableSearchParams,
			replace: true,
		});
	};

	const setTypeFilter = (
		next: StaffTenantProfileTypeFilter | undefined,
	): void => {
		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...search,
				is_default: next === undefined ? undefined : next === 'true',
				cursor: undefined,
			}) as unknown as TableSearchParams,
			replace: true,
		});
	};

	const setView = (next: StaffTenantProfilesViewMode): void => {
		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...search,
				view: next === 'table' ? 'table' : undefined,
			}) as unknown as TableSearchParams,
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: `${tenantId}:${search.is_default ?? ''}`,
	});
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const profilesQuery = useStaffTenantProfilesQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
			isDefault: toStaffTenantProfileTypeFilterString(search.is_default),
		},
		{
			enabled: tenantId.length > 0,
		},
	);

	const rows = toStaffTenantProfileRows(profilesQuery.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));

	// The drawer edits a row this list already carries — its whole contract is
	// `{ id, name, description, icon?, tone? }`, every field of which is on the
	// row — so opening it costs no extra request. An `?edit=<id>` that names no
	// loaded row (a stale bookmark, or a profile filtered off the current page)
	// simply leaves the drawer shut rather than inventing a profile to show.
	const editingProfile = editProfileId
		? rows.find((row) => row.id === editProfileId)
		: undefined;
	const isEditDrawerOpen = editingProfile !== undefined;
	// Keep the last edited row so the drawer stays mounted through its close
	// animation, exactly as the always-mounted drawer on the detail page does.
	const lastEditedProfileRef = useRef<StaffTenantProfileRow | null>(null);
	useEffect(() => {
		if (editingProfile) {
			lastEditedProfileRef.current = editingProfile;
		}
	}, [editingProfile]);
	const editDrawerProfile = editingProfile ?? lastEditedProfileRef.current;

	// Both drawers' open flags live in the URL (`?new=1`, `?edit=<id>`); a
	// browser Back or a sibling-route navigation changes/unmounts them without
	// ever calling the drawer's own `onOpenChange` close guard, discarding a
	// dirty draft silently (tenants-r1-F2). One blocker owns both, so a
	// transition can never raise two competing confirm dialogs.
	const drawerBlocker = useBlocker({
		shouldBlockFn: ({ current, next }) => {
			if (
				isCreateDrawerOpen &&
				isCreateFormDirty &&
				!createDrawerNavBypassRef.current
			) {
				return true;
			}

			if (
				!isEditDrawerOpen ||
				!isEditFormDirty ||
				editDrawerNavBypassRef.current
			) {
				return false;
			}

			// Mirrors the detail page's guard: a transition that keeps this exact
			// list route AND the same `?edit=<id>` (a filter change, a sort, a
			// page size) leaves the drawer open with its draft intact, so a
			// discard prompt there would be misleading. Only block transitions
			// that actually leave the open drawer.
			const staysOnOpenDrawer =
				next.pathname === current.pathname &&
				(next.search as StaffTenantProfilesSearchParams).edit === editProfileId;

			return !staysOnOpenDrawer;
		},
		withResolver: true,
	});
	const view = parseStaffTenantProfilesViewMode(search.view);

	// tenants-r6-F2: freeze the destructive selection target set — cancel a
	// pending search commit the moment selection mode starts (mirrors
	// invitations/index.tsx, staff-users.tsx, staff/profiles.tsx); the type
	// filter trigger below is disabled for the same reason.
	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	// `openEditDrawer` closes over `search`, which is a fresh object every
	// render, so handing it to the memo directly would rebuild every column
	// definition on every render. The columns get this stable indirection
	// instead; it always calls the current render's handler. The ref-write is
	// an idempotent latest-value sync during render — the documented escape
	// hatch for the “no ref writes in render” rule.
	const openEditDrawerRef = useRef(openEditDrawer);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- latest-value sync, see comment above
	useEffect(() => {
		openEditDrawerRef.current = openEditDrawer;
	}); // react-doctor-disable-line react-doctor/exhaustive-deps, react-doctor/no-effect-with-fresh-deps
	const onEditRequest = useCallback((profile: StaffTenantProfileRow) => {
		openEditDrawerRef.current(profile);
	}, []);

	const columns = useMemo(
		() => makeTenantProfileColumns(tenantId, t, onEditRequest, setDeleteTarget),
		[tenantId, t, onEditRequest, setDeleteTarget],
	);

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	const tenant = toStaffTenantDetails(detailsQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	if (profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error)) {
		return <LogoutRedirect />;
	}

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	const testId = 'staff-tenant-profiles-grid';
	const hasActiveSearch = Boolean(
		controller.search.committed || search.is_default !== undefined,
	);
	const bodyState = resolveTableBodyState({
		isPending: profilesQuery.isPending,
		isError: profilesQuery.isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	const toggleCardSelection = (profileId: string): void => {
		const visibleIds = rows.map((row) => row.id);
		const currentlySelected = new Set(
			visibleIds.filter((id) => selection.rowSelection[id]),
		);

		if (currentlySelected.has(profileId)) {
			currentlySelected.delete(profileId);
		} else {
			currentlySelected.add(profileId);
		}

		selection.onSelectionChange(currentlySelected);
	};

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}

		try {
			await deleteProfile.mutateAsync({
				tenantId,
				profileId: deleteTarget.id,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
			}
			setDeleteTarget(null);
			return;
		}

		setDeleteTarget(null);
		await invalidateAllStaffTenantScopes(queryClient);
	};

	const toolbarEnd = (
		<div className="flex items-center gap-2">
			<ProfileTypeFilter
				value={toStaffTenantProfileTypeFilterString(search.is_default)}
				onChange={setTypeFilter}
				testId={testId}
				disabled={selection.isSelectionMode}
			/>
			<ProfileViewToggle view={view} onChange={setView} testId={testId} />
		</div>
	);

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			testId="staff-tenant-profiles-page"
			bodyScroll={view === 'table' ? 'contained' : 'page'}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="publy-type-page-title">
						{t('profiles')}
						{tenant.profilesCount != null ? (
							<span className="ml-2 publy-profile-count-badge align-middle">
								{tenant.profilesCount}
							</span>
						) : null}
					</h2>
					<p className="publy-type-helper">
						{t('tenant-profiles-tab-description')}
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					onClick={() => setCreateDrawerOpen(true)}
				>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('new-profile')}
				</Button>
			</div>

			{view === 'table' ? (
				<DataTable<StaffTenantProfileRow>
					testId={testId}
					ariaLabel={t('tenant-profiles-table-aria-label')}
					columns={columns}
					rows={rows}
					getRowLabel={(row) => row.name}
					isPending={profilesQuery.isPending}
					isError={profilesQuery.isError}
					onRetry={() => void profilesQuery.refetch()}
					emptyIcon={IconShield}
					emptyContent={t('tenant-profiles-empty-description')}
					noMatchContent={t('tenant-profiles-no-match-description')}
					hasActiveSearch={hasActiveSearch}
					sort={controller.sort}
					onSortChange={controller.onSortChange}
					size={controller.size}
					onSizeChange={controller.onSizeChange}
					pageIndex={controller.cursor.pageIndex}
					hasPreviousPage={controller.cursor.hasPreviousPage}
					hasNextPage={profilesQuery.data?.nextCursor != null}
					isPaginationPending={profilesQuery.isFetching}
					onNextPage={() =>
						controller.cursor.onNextPage(
							profilesQuery.data?.nextCursor ?? undefined,
						)
					}
					onPreviousPage={controller.cursor.onPreviousPage}
					searchDraft={controller.search.draft}
					onSearchDraftChange={controller.search.onDraftChange}
					searchPlaceholder={t('search-profiles')}
					selection={selection}
					toolbarEnd={toolbarEnd}
				/>
			) : (
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
								<Button
									type="button"
									variant="outline"
									onClick={() => void profilesQuery.refetch()}
								>
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
										onDeleteRequest={setDeleteTarget}
										isSelected={Boolean(selection.rowSelection[profile.id])}
										isSelectionMode={selection.isSelectionMode}
										onToggleSelect={toggleCardSelection}
									/>
								))}
							</div>
							<DataTableCursorFooter
								testId={testId}
								pageIndex={controller.cursor.pageIndex}
								size={controller.size}
								onSizeChange={controller.onSizeChange}
								hasPreviousPage={controller.cursor.hasPreviousPage}
								hasNextPage={profilesQuery.data?.nextCursor != null}
								isPaginationPending={profilesQuery.isFetching}
								onNextPage={() =>
									controller.cursor.onNextPage(
										profilesQuery.data?.nextCursor ?? undefined,
									)
								}
								onPreviousPage={controller.cursor.onPreviousPage}
								disabled={selection.isSelectionMode}
								disabledTitle={t(SELECTION_LOCKED_TITLE_KEY)}
								variant="flat"
							/>
						</>
					) : null}
				</div>
			)}

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
				<ProfileBulkActions
					tenantId={tenantId}
					rows={rows}
					selection={selection}
					onSessionExpired={() => setShouldRedirectToLogout(true)}
				/>
			</FloatingSelectionBar>

			<ConfirmDialog
				isOpen={deleteTarget !== null}
				title={t('delete')}
				description={t('confirm-delete-tenant-profile-description')}
				confirmLabel={t('delete')}
				isPending={deleteProfile.isPending}
				onConfirm={() => {
					void handleDelete();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setDeleteTarget(null);
				}}
			/>

			<ProfileFormDrawer
				tenantId={tenantId}
				isOpen={isCreateDrawerOpen}
				onOpenChange={setCreateDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
				onDirtyChange={setIsCreateFormDirty}
				onSaved={(profileId) => {
					// A successful submit must never be blocked by the parent's own
					// nav guard reading a not-yet-flushed dirty flag (W8-DRAWER).
					createDrawerNavBypassRef.current = true;

					if (profileId) {
						void navigate({
							to: '/staff/tenants/$tenantId/profiles/$profileId',
							params: { tenantId, profileId },
						});
						return;
					}

					setCreateDrawerOpen(false);
				}}
			/>

			{/* #972: the same drawer the detail page mounts, hosted here so the
			 * quick edit stays quick — the list underneath never unmounts, so its
			 * filters, cursor page, selection and scroll are exactly where the
			 * user left them when the drawer closes. */}
			{editDrawerProfile ? (
				<ProfileEditDetailsDrawer
					tenantId={tenantId}
					isOpen={isEditDrawerOpen}
					profile={editDrawerProfile}
					onOpenChange={(isOpen) => {
						if (!isOpen) {
							closeEditDrawer();
						}
					}}
					onSessionExpired={() => setShouldRedirectToLogout(true)}
					onDirtyChange={setIsEditFormDirty}
					onSaved={() => closeEditDrawer()}
				/>
			) : null}

			<ConfirmDialog
				isOpen={drawerBlocker.status === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
				tone="danger"
				onConfirm={() => drawerBlocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						drawerBlocker.reset?.();
					}
				}}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{ kind: 'label', labelKey: 'common:profiles' },
		],
	},
	validateSearch: (search) =>
		serializeStaffTenantProfilesSearchParams(
			parseStaffTenantProfilesSearchParams(
				search as StaffTenantProfilesSearchParamInput,
			),
		),
	component: StaffTenantProfilesPage,
});

const ProfileCardGridSkeleton = ({ testId }: { testId: string }) => (
	<div className="publy-profile-card-grid" data-testid={`${testId}-loading`}>
		{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map((key) => (
			<Card key={key} className="flex flex-col gap-3 p-4">
				<Skeleton className="size-10 rounded-[10px]" />
				<Skeleton className="h-3 w-2/3" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-1/3" />
			</Card>
		))}
	</div>
);

const ProfileRowActions = ({
	tenantId,
	profile,
	onEditRequest,
	onDeleteRequest,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
	onEditRequest: (profile: StaffTenantProfileRow) => void;
	onDeleteRequest: (profile: StaffTenantProfileRow) => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<DataTableRowActions
			ariaLabel={t('actions-for', { name: profile.name || t('profile') })}
			testId={`staff-tenant-profile-actions-${profile.id}`}
		>
			<DropdownMenuItem
				render={
					<Link
						to="/staff/tenants/$tenantId/profiles/$profileId"
						params={{ tenantId, profileId: profile.id }}
					/>
				}
			>
				<IconEye className="size-[15px]" />
				{t('view-details')}
			</DropdownMenuItem>
			{/* #972: NOT a <Link> to `.../$profileId/edit`. That route is a frozen
			 * redirect stub kept only for old bookmarks, so linking to it cost a
			 * full navigation to the detail page and threw away this list's
			 * filters, cursor page, selection and scroll. Editing is a list-local
			 * search-state change (`?edit=<profileId>`) that opens the same drawer
			 * over the list. */}
			<DropdownMenuItem
				data-testid={`staff-tenant-profile-edit-${profile.id}`}
				onClick={() => onEditRequest(profile)}
			>
				<IconPencil className="size-[15px]" />
				{t('edit')}
			</DropdownMenuItem>
			<DropdownMenuItem
				variant="destructive"
				disabled={profile.isDefault}
				title={
					profile.isDefault ? t('default-profile-delete-disabled') : undefined
				}
				data-testid={`staff-tenant-profile-delete-${profile.id}`}
				onClick={() => onDeleteRequest(profile)}
			>
				<IconTrash className="size-[15px]" />
				{t('delete')}
			</DropdownMenuItem>
		</DataTableRowActions>
	);
};

const ProfileCard = ({
	tenantId,
	profile,
	onEditRequest,
	onDeleteRequest,
	isSelected,
	isSelectionMode,
	onToggleSelect,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
	onEditRequest: (profile: StaffTenantProfileRow) => void;
	onDeleteRequest: (profile: StaffTenantProfileRow) => void;
	isSelected: boolean;
	isSelectionMode: boolean;
	onToggleSelect: (profileId: string) => void;
}) => {
	const { t } = useTranslation('common');
	const { Icon: ProfileIcon, tone } = deriveTenantProfileCardStyle(
		profile.name,
		profile.icon,
		profile.tone,
	);

	return (
		<Card
			className={cn(
				'group/profile-card relative flex items-start gap-3 p-4',
				isSelected && 'publy-profile-card--selected',
			)}
			data-testid={`staff-tenant-profile-card-${profile.id}`}
		>
			<span
				className={cn(
					'absolute left-3 top-3 z-(--publy-z-raised) flex size-4 shrink-0 items-center justify-center rounded-[7px] bg-background transition-opacity',
					isSelectionMode
						? 'opacity-100'
						: 'opacity-0 group-hover/profile-card:opacity-100 focus-within:opacity-100',
				)}
			>
				<Checkbox
					checked={isSelected}
					onCheckedChange={() => onToggleSelect(profile.id)}
					aria-label={t('select-profile-checkbox-label', {
						name: profile.name || t('profile'),
					})}
					data-testid={`staff-tenant-profile-card-select-${profile.id}`}
				/>
			</span>

			<Link
				to="/staff/tenants/$tenantId/profiles/$profileId"
				params={{ tenantId, profileId: profile.id }}
				className="shrink-0 no-underline"
			>
				<span
					className="publy-profile-icon-tile publy-profile-icon-tile--lg"
					data-tone={tone}
				>
					<ProfileIcon aria-hidden="true" />
				</span>
			</Link>

			<div className="min-w-0 flex-1 space-y-1 pr-7">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Link
						to="/staff/tenants/$tenantId/profiles/$profileId"
						params={{ tenantId, profileId: profile.id }}
						className="publy-record-link truncate text-[14px] font-semibold text-foreground no-underline"
						title={profile.name}
					>
						{profile.name}
					</Link>
					<span className={tenantProfileTypeChipClassName(profile.isDefault)}>
						{profile.isDefault ? t('system') : t('custom')}
					</span>
				</div>
				<p
					className="truncate text-xs text-muted-foreground"
					title={profile.description || undefined}
				>
					{profile.description || t('no-description-provided')}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{t('tenant-member-count', { count: profile.userAccountCount })}
					{' · '}
					{t('tenant-permission-count', { count: profile.permissionsCount })}
				</p>
			</div>

			<div className="absolute right-3 top-3">
				<ProfileRowActions
					tenantId={tenantId}
					profile={profile}
					onEditRequest={onEditRequest}
					onDeleteRequest={onDeleteRequest}
				/>
			</div>
		</Card>
	);
};

const ProfileNameCell = ({
	tenantId,
	profile,
	t,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	const { Icon: ProfileIcon, tone } = deriveTenantProfileCardStyle(
		profile.name,
		profile.icon,
		profile.tone,
	);

	return (
		<Link
			to="/staff/tenants/$tenantId/profiles/$profileId"
			params={{ tenantId, profileId: profile.id }}
			className="flex min-w-0 items-center gap-2.5 no-underline"
		>
			<span className="publy-profile-icon-tile" data-tone={tone}>
				<ProfileIcon aria-hidden="true" />
			</span>
			<span className="flex min-w-0 flex-wrap items-center gap-2">
				<span
					className="publy-record-link truncate text-[13px] font-medium"
					title={profile.name}
				>
					{profile.name}
				</span>
				<span className={tenantProfileTypeChipClassName(profile.isDefault)}>
					{profile.isDefault ? t('system') : t('custom')}
				</span>
			</span>
		</Link>
	);
};

export const makeTenantProfileColumns = (
	tenantId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
	onEditRequest: (profile: StaffTenantProfileRow) => void,
	onDeleteRequest: (profile: StaffTenantProfileRow) => void,
): ColumnDef<StaffTenantProfileRow>[] => [
	{
		id: 'name',
		header: t('profile'),
		cell: ({ row }) => (
			<ProfileNameCell tenantId={tenantId} profile={row.original} t={t} />
		),
	},
	{
		id: 'description',
		header: t('description'),
		enableSorting: false,
		cell: ({ row }) => (
			<span
				className="block truncate text-xs text-muted-foreground"
				title={row.original.description || undefined}
			>
				{row.original.description || t('no-description-provided')}
			</span>
		),
	},
	{
		id: 'members',
		header: t('members'),
		accessorKey: 'userAccountCount',
		enableSorting: false,
		meta: { width: '110px' },
		cell: ({ getValue }) => (
			<span className="text-[13px] text-foreground">{getValue<number>()}</span>
		),
	},
	{
		id: 'permissions',
		header: t('permissions'),
		accessorKey: 'permissionsCount',
		enableSorting: false,
		meta: { width: '120px' },
		cell: ({ getValue }) => (
			<span className="text-[13px] text-foreground">{getValue<number>()}</span>
		),
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<ProfileRowActions
				tenantId={tenantId}
				profile={row.original}
				onEditRequest={onEditRequest}
				onDeleteRequest={onDeleteRequest}
			/>
		),
	},
];

const ProfileBulkActions = ({
	tenantId,
	rows,
	selection,
	onSessionExpired,
}: {
	tenantId: string;
	rows: StaffTenantProfileRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const bulkDeleteMutation = useBulkDeleteStaffTenantProfilesMutation();

	const selectedRows = rows.filter((row) => selection.rowSelection[row.id]);
	const eligibleIds = selectedRows.flatMap((row) =>
		row.isDefault ? [] : [row.id],
	);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;

	const performBulkDelete = async () => {
		let result;
		try {
			result = await bulkDeleteMutation.mutateAsync({
				tenantId,
				profileIds: eligibleIds,
			});
		} catch (error) {
			setIsDeleteDialogOpen(false);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t('tenant-profile-bulk-delete-failure'),
			);
			return;
		}

		setIsDeleteDialogOpen(false);
		selection.clearSelection();

		const summary = toStaffTenantProfileBulkActionSummary(result);
		if (summary.failedCount > 0) {
			toastLocalMutationResult.error(
				t('tenant-profile-bulk-delete-partial-success', {
					succeeded: summary.succeededCount,
					failed: summary.failedCount,
				}),
			);
		} else {
			toastLocalMutationResult.success(
				t('tenant-profile-bulk-delete-success', {
					count: summary.succeededCount,
				}),
			);
		}

		await invalidateAllStaffTenantScopes(queryClient);
	};

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={isOverLimit}
				title={
					isOverLimit
						? t('bulk-action-max-count-exceeded', {
								max: BULK_ACTION_MAX_COUNT,
								count: selectedCount,
							})
						: undefined
				}
				className={FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME}
				onClick={() => {
					if (eligibleIds.length === 0) {
						toastLocalMutationResult.warning(
							t('bulk-delete-disabled-only-default-profiles'),
						);
						return;
					}
					setIsDeleteDialogOpen(true);
				}}
			>
				<IconTrash className="size-[15px]" />
				{t('bulk-delete')}
			</Button>

			<ConfirmDialog
				isOpen={isDeleteDialogOpen}
				title={t('bulk-delete')}
				description={t('confirm-bulk-delete-tenant-profiles', {
					count: eligibleIds.length,
				})}
				confirmLabel={t('delete')}
				isPending={bulkDeleteMutation.isPending}
				onConfirm={() => {
					void performBulkDelete();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setIsDeleteDialogOpen(false);
				}}
			/>
		</>
	);
};

const ProfileViewToggle = ({
	view,
	onChange,
	testId,
}: {
	view: StaffTenantProfilesViewMode;
	onChange: (next: StaffTenantProfilesViewMode) => void;
	testId: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<div
			className="publy-data-table-view-toggle border border-border bg-background p-0.5"
			role="group"
			aria-label={t('view-toggle-aria-label')}
		>
			<button
				type="button"
				className={cn(
					'publy-data-table-view-toggle-item flex size-8 items-center justify-center',
					view === 'cards'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground',
				)}
				aria-pressed={view === 'cards'}
				aria-label={t('cards-view')}
				data-testid={`${testId}-view-toggle-cards`}
				onClick={() => onChange('cards')}
			>
				<IconLayoutGrid className="size-4" />
			</button>
			<button
				type="button"
				className={cn(
					'publy-data-table-view-toggle-item flex size-8 items-center justify-center',
					view === 'table'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground',
				)}
				aria-pressed={view === 'table'}
				aria-label={t('table-view')}
				data-testid={`${testId}-view-toggle-table`}
				onClick={() => onChange('table')}
			>
				<IconTable className="size-4" />
			</button>
		</div>
	);
};

const formatProfileTypeFilterLabel = (
	value: StaffTenantProfileTypeFilter | undefined,
	t: (key: string) => string,
): string => {
	if (value === 'true') {
		return t('system');
	}

	if (value === 'false') {
		return t('custom');
	}

	return t('all-types');
};

const ProfileTypeFilter = ({
	value,
	onChange,
	testId,
	disabled,
}: {
	value: StaffTenantProfileTypeFilter | undefined;
	onChange: (next: StaffTenantProfileTypeFilter | undefined) => void;
	testId: string;
	disabled?: boolean;
}) => {
	const { t } = useTranslation('common');
	const label = formatProfileTypeFilterLabel(value, t);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="outline"
						className="publy-data-table-filter-button max-w-64 text-[13px]"
						data-testid={`${testId}-type-filter-trigger`}
						disabled={disabled}
						title={disabled ? t(SELECTION_LOCKED_TITLE_KEY) : undefined}
					/>
				}
			>
				<IconFilter
					aria-hidden="true"
					className="size-[15px] text-[var(--publy-foreground-secondary)]"
				/>
				<span className="truncate">{label}</span>
				<IconChevronDown aria-hidden="true" className="size-3" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={6}>
				<DropdownMenuCheckboxItem
					checked={value === undefined}
					closeOnClick
					data-testid={`${testId}-type-filter-all`}
					onCheckedChange={() => onChange(undefined)}
				>
					{t('all-types')}
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={value === 'true'}
					closeOnClick
					data-testid={`${testId}-type-filter-system`}
					onCheckedChange={() => onChange('true')}
				>
					{t('system')}
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={value === 'false'}
					closeOnClick
					data-testid={`${testId}-type-filter-custom`}
					onCheckedChange={() => onChange('false')}
				>
					{t('custom')}
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => onChange(undefined)}>
					{t('clear')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
