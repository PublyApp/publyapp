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
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ProfileFormDrawer } from './profiles/_profile-form-drawer';

export { deriveTenantProfileCardStyle } from './profiles/_profile-card-style';

export type StaffTenantProfileTypeFilter = 'true' | 'false';
export type StaffTenantProfilesViewMode = 'cards' | 'table';

export type StaffTenantProfilesSearchParams = TableSearchParams & {
	new?: 1;
	/** Snake_case + a REAL boolean: this object IS the route search state the
	 * router serializes into the URL — a camelCase key would leak into the URL,
	 * and a 'true' STRING would be JSON-quoted (`?is_default=%22true%22`). */
	is_default?: boolean;
	view?: 'table';
};
export type StaffTenantProfilesSearchParamInput = TableSearchParamInput & {
	new?: unknown;
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
		new: isCreateOpen ? (1 as const) : undefined,
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
		new: params.new === 1 ? (1 as const) : undefined,
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

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles',
)({
	staticData: { i18nNamespaces: ['staff-tenant-profiles'] },
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
	onDeleteRequest,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
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
			<DropdownMenuItem
				render={
					<Link
						to="/staff/tenants/$tenantId/profiles/$profileId/edit"
						params={{ tenantId, profileId: profile.id }}
					/>
				}
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
	onDeleteRequest,
	isSelected,
	isSelectionMode,
	onToggleSelect,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
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
					'absolute left-3 top-3 z-10 flex size-4 shrink-0 items-center justify-center rounded-[7px] bg-background transition-opacity',
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
	const eligibleIds = selectedRows
		.filter((row) => !row.isDefault)
		.map((row) => row.id);
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

function StaffTenantProfilesPage() {
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

	const isCreateDrawerOpen = search.new === 1;

	// `onDirtyChange(false)` (called by the drawer right before an
	// app-initiated close/submit navigation) is an async React state update —
	// a `navigate()` fired synchronously right after it still sees the old
	// (dirty) render's `shouldBlockFn` closure. This ref is set synchronously
	// by every app-initiated close/navigate path below so the guard never
	// blocks its own transition (W8-DRAWER; only a real browser Back or
	// sibling-route nav should ever trip it).
	const createDrawerNavBypassRef = useRef(false);

	// The create drawer's open flag lives in the URL (`?new=1`); a browser
	// Back or a sibling-route navigation changes/unmounts it without ever
	// calling the drawer's own `onOpenChange` close guard, discarding a dirty
	// create draft silently (tenants-r1-F2).
	const createDrawerBlocker = useBlocker({
		shouldBlockFn: () =>
			isCreateDrawerOpen &&
			isCreateFormDirty &&
			!createDrawerNavBypassRef.current,
		withResolver: true,
	});
	const view = parseStaffTenantProfilesViewMode(search.view);

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

	const columns = useMemo(
		() => makeTenantProfileColumns(tenantId, t, setDeleteTarget),
		[tenantId, t, setDeleteTarget],
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
			<ConfirmDialog
				isOpen={createDrawerBlocker.status === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
				tone="danger"
				onConfirm={() => createDrawerBlocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						createDrawerBlocker.reset?.();
					}
				}}
			/>
		</TenantDetailsPageShell>
	);
}
