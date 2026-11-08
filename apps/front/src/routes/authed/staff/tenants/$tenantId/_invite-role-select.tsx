import {
	IconChevronDown,
	IconChevronLeft,
	IconChevronRight,
	IconSearch,
} from '@tabler/icons-react';
import { useDeferredValue, useEffect, useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import QueryDisplay from '~/components/query-display';
import { useCursorPagination } from '~/components/table/use-cursor-pagination';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	toStaffTenantRoleRows,
	useStaffTenantRolesQuery,
	type StaffTenantRoleRow,
} from '~/lib/query/staff-tenant-roles';
import { displayRoleName } from '~/lib/roles/display-role';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/*
 * Page size for the invite drawer's role picker. Server-side search +
 * cursor pagination (#821 pattern) instead of fetching the whole catalogue —
 * the previous hard-coded `size: 100` silently truncated tenants with more
 * than 100 roles.
 */
const INVITE_ROLE_PAGE_SIZE = 20;

const getSelectorFailureMessage = (
	error: unknown,
	t: (key: string) => string,
): string =>
	getFailureMessage(toApiFailure(error), {
		fallback: t('unable-to-load-roles'),
	});

const toStringArray = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	return [];
};

/** Resolves chip labels for selections whose rows are not on the currently
 * loaded page: roles are remembered from every page this session fetched,
 * so a renamed or default row keeps its translated display name. */
const buildKnownRoleLookup = (
	rows: StaffTenantRoleRow[],
	knownRoles: Map<string, StaffTenantRoleRow>,
): Map<string, StaffTenantRoleRow> => {
	const lookup = new Map(knownRoles);

	for (const row of rows) {
		lookup.set(row.id, row);
	}

	return lookup;
};

export const InviteRoleSelect = ({
	tenantId,
	name,
	label,
	isDisabled = false,
}: {
	tenantId: string;
	name: string;
	label: string;
	isDisabled?: boolean;
}) => {
	const { control } = useFormContext();
	const { t } = useTranslation('common');
	const labelId = useId();
	const helperId = `${labelId}-helper`;
	const [roleSearch, setRoleSearch] = useState('');
	const [knownRoles, setKnownRoles] = useState(
		() => new Map<string, StaffTenantRoleRow>(),
	);
	const deferredRoleSearch = useDeferredValue(roleSearch.trim());
	const isRoleSearchSettled = roleSearch.trim() === deferredRoleSearch;

	const rolePagination = useCursorPagination({
		sortId: 'name',
		sortOrder: 'asc',
		size: INVITE_ROLE_PAGE_SIZE,
		scopeKey: deferredRoleSearch,
	});
	const rolesQuery = useStaffTenantRolesQuery({
		tenantId,
		sortId: 'name',
		sortOrder: 'asc',
		q: deferredRoleSearch || undefined,
		cursor: rolePagination.cursor,
		size: INVITE_ROLE_PAGE_SIZE,
	});
	const roles = toStaffTenantRoleRows(rolesQuery.data?.data);
	// The cursor sits on the result envelope; `data.data` is the item array.
	const nextCursor = rolesQuery.data?.nextCursor;
	const hasNextPage = typeof nextCursor === 'string' && nextCursor.length > 0;

	// Hoisted locals keep raw query flags out of the effect gate.
	const rolesIsPending = rolesQuery.isPending;
	const rolesIsError = rolesQuery.isError;
	const rolesError = rolesQuery.error;

	useEffect(() => {
		setKnownRoles((previous) => {
			const lookup = buildKnownRoleLookup(roles, previous);
			if (lookup.size === previous.size) {
				return previous;
			}
			return lookup;
		});
	}, [roles]);

	// Fatal-error render gate (tenants.tsx pattern): a session-killing failure
	// short-circuits to <LogoutRedirect /> here, so the user is bounced
	// through the central 401 redirect rather than seeing a stale role
	// dropdown.
	if (rolesIsError && shouldLogoutForFailure(rolesError)) {
		return <LogoutRedirect />;
	}

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const selectedIds = toStringArray(field.value);
				// O(1) membership for the two per-role checks below instead of
				// an Array.includes scan per row (react-doctor/js-set-map-lookups).
				const selectedIdSet = new Set(selectedIds);
				const queryError = rolesIsError
					? getSelectorFailureMessage(rolesError, t)
					: '';
				const helper = error?.message ?? queryError;
				const isInvalid = Boolean(error || queryError);
				let triggerLabel = t('select-roles');
				if (rolesIsPending) {
					triggerLabel = t('loading-roles');
				} else if (selectedIds.length > 0) {
					triggerLabel = t('roles-selected-count', {
						count: selectedIds.length,
					});
				}

				const toggleRole = (roleId: string, checked: boolean) => {
					field.onChange(
						checked
							? [...new Set([...selectedIds, roleId])]
							: selectedIds.filter((selectedId) => selectedId !== roleId),
					);
				};

				// Empty page of the envelope: the message element is shared by the
				// EmptySlot and the data/error views (the parent showed it whenever
				// `roles.length === 0`).
				const noRolesMessage = (
					<p className="px-3 py-2 text-[13px] text-muted-foreground">
						{t('no-roles-available')}
					</p>
				);
				const renderRoleRows = (rows: StaffTenantRoleRow[]) =>
					rows.length === 0
						? noRolesMessage
						: rows.map((role) => {
								const roleName = displayRoleName(role, t);

								return (
									<DropdownMenuCheckboxItem
										key={role.id}
										checked={selectedIdSet.has(role.id)}
										closeOnClick={false}
										showCheckbox
										onCheckedChange={(checked) => {
											toggleRole(role.id, Boolean(checked));
										}}
									>
										<span className="min-w-0 flex-1 truncate" title={roleName}>
											{roleName}
										</span>
										{role.isDefault ? (
											<Badge variant="secondary">{t('default')}</Badge>
										) : null}
									</DropdownMenuCheckboxItem>
								);
							});

				return (
					<div className="space-y-1.5">
						<p id={labelId} className="text-[13px] font-medium text-foreground">
							{label}
						</p>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										type="button"
										variant="outline"
										className="w-full justify-between"
										disabled={isDisabled || rolesIsPending}
										aria-labelledby={labelId}
										aria-invalid={isInvalid || undefined}
										aria-describedby={helper ? helperId : undefined}
									/>
								}
							>
								<span className="min-w-0 flex-1 truncate text-left">
									{triggerLabel}
								</span>
								{rolesIsPending ? (
									<LoadingSpinner />
								) : (
									<IconChevronDown aria-hidden="true" className="size-3" />
								)}
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-80">
								<div className="flex items-center gap-2 px-2 py-1.5">
									<IconSearch
										aria-hidden="true"
										className="size-3.5 shrink-0 text-muted-foreground"
									/>
									<Input
										value={roleSearch}
										onChange={(event) => {
											setRoleSearch(event.target.value);
											// scopeKey change resets the cursor stack inside the
											// pagination hook; no manual reset needed here.
										}}
										placeholder={t('search')}
										aria-label={t('search-roles')}
										className="h-7 border-none bg-transparent shadow-none focus-visible:ring-0"
									/>
									{!isRoleSearchSettled || rolesIsPending ? (
										<LoadingSpinner />
									) : null}
								</div>
								<QueryDisplay
									query={rolesQuery}
									variant="inline"
									LoadingSlot={
										<p className="px-3 py-2 text-[13px] text-muted-foreground">
											{t('loading-roles')}
										</p>
									}
									EmptySlot={noRolesMessage}
									// A failed refetch keeps the last good data (TanStack v5
									// flips `status: 'error'` without clearing `data`): the
									// parent kept rendering the loaded rows, so the held
									// envelope drives this slot too. On a first-load failure
									// `data` is undefined -> rows=[] -> the same «
									// no-roles-available » message as before.
									ErrorSlot={({ query }) =>
										renderRoleRows(toStaffTenantRoleRows(query.data?.data))
									}
								>
									{({ data }) =>
										renderRoleRows(toStaffTenantRoleRows(data?.data))
									}
								</QueryDisplay>
								<div className="flex items-center justify-between border-t px-1 py-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={!rolePagination.hasPreviousPage}
										onClick={rolePagination.retreat}
									>
										<IconChevronLeft aria-hidden="true" className="size-3.5" />
										{t('previous')}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={
											!hasNextPage || !isRoleSearchSettled || rolesIsPending
										}
										onClick={() => {
											if (typeof nextCursor === 'string') {
												rolePagination.advance(nextCursor);
											}
										}}
									>
										{t('next')}
										<IconChevronRight aria-hidden="true" className="size-3.5" />
									</Button>
								</div>
							</DropdownMenuContent>
						</DropdownMenu>

						{selectedIds.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{selectedIds.map((selectedId) => {
									const knownRole = knownRoles.get(selectedId);

									return (
										<span
											key={selectedId}
											className="publy-detail-chip publy-detail-chip--outline"
										>
											{knownRole ? displayRoleName(knownRole, t) : selectedId}
										</span>
									);
								})}
							</div>
						) : null}

						{renderFieldHelper({ helper, isInvalid, helperId })}
					</div>
				);
			}}
		/>
	);
};
