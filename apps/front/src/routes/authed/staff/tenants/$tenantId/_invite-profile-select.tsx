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
	toStaffTenantProfileRows,
	useStaffTenantProfilesQuery,
	type StaffTenantProfileRow,
} from '~/lib/query/staff-tenant-profiles';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/*
 * Page size for the invite drawer's profile picker. Server-side search +
 * cursor pagination (#821 pattern) instead of fetching the whole catalogue —
 * the previous hard-coded `size: 100` silently truncated tenants with more
 * than 100 profiles.
 */
const INVITE_PROFILE_PAGE_SIZE = 20;

const getSelectorFailureMessage = (
	error: unknown,
	t: (key: string) => string,
): string =>
	getFailureMessage(toApiFailure(error), {
		fallback: t('unable-to-load-profiles'),
	});

const toStringArray = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	return [];
};

/** Resolves chip labels for selections whose rows are not on the currently
 * loaded page: names are remembered from every page this session fetched. */
const buildKnownNameLookup = (
	rows: StaffTenantProfileRow[],
	knownNames: Map<string, string>,
): Map<string, string> => {
	const lookup = new Map(knownNames);

	for (const row of rows) {
		lookup.set(row.id, row.name);
	}

	return lookup;
};

export const InviteProfileSelect = ({
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
	const [profileSearch, setProfileSearch] = useState('');
	const [knownNames, setKnownNames] = useState(() => new Map<string, string>());
	const deferredProfileSearch = useDeferredValue(profileSearch.trim());
	const isProfileSearchSettled = profileSearch.trim() === deferredProfileSearch;

	const profilePagination = useCursorPagination({
		sortId: 'name',
		sortOrder: 'asc',
		size: INVITE_PROFILE_PAGE_SIZE,
		scopeKey: deferredProfileSearch,
	});
	const profilesQuery = useStaffTenantProfilesQuery({
		tenantId,
		sortId: 'name',
		sortOrder: 'asc',
		q: deferredProfileSearch || undefined,
		cursor: profilePagination.cursor,
		size: INVITE_PROFILE_PAGE_SIZE,
	});
	const profiles = toStaffTenantProfileRows(profilesQuery.data?.data);
	// The cursor sits on the result envelope; `data.data` is the item array.
	const nextCursor = profilesQuery.data?.nextCursor;
	const hasNextPage = typeof nextCursor === 'string' && nextCursor.length > 0;

	// Hoisted locals keep raw query flags out of the effect gate.
	const profilesIsPending = profilesQuery.isPending;
	const profilesIsError = profilesQuery.isError;
	const profilesError = profilesQuery.error;

	useEffect(() => {
		setKnownNames((previous) => {
			const lookup = buildKnownNameLookup(profiles, previous);
			if (lookup.size === previous.size) {
				return previous;
			}
			return lookup;
		});
	}, [profiles]);

	// Fatal-error render gate (tenants.tsx pattern): a session-killing failure
	// short-circuits to <LogoutRedirect /> here, so the user is bounced
	// through the central 401 redirect rather than seeing a stale profile
	// dropdown.
	if (profilesIsError && shouldLogoutForFailure(profilesError)) {
		return <LogoutRedirect />;
	}

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const selectedIds = toStringArray(field.value);
				// O(1) membership for the two per-profile checks below instead of
				// an Array.includes scan per row (react-doctor/js-set-map-lookups).
				const selectedIdSet = new Set(selectedIds);
				const queryError = profilesIsError
					? getSelectorFailureMessage(profilesError, t)
					: '';
				const helper = error?.message ?? queryError;
				const isInvalid = Boolean(error || queryError);
				let triggerLabel = t('select-profiles');
				if (profilesIsPending) {
					triggerLabel = t('loading-profiles');
				} else if (selectedIds.length > 0) {
					triggerLabel = t('profiles-selected-count', {
						count: selectedIds.length,
					});
				}

				const toggleProfile = (profileId: string, checked: boolean) => {
					field.onChange(
						checked
							? [...new Set([...selectedIds, profileId])]
							: selectedIds.filter((selectedId) => selectedId !== profileId),
					);
				};

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
										disabled={isDisabled || profilesIsPending}
										aria-labelledby={labelId}
										aria-invalid={isInvalid || undefined}
										aria-describedby={helper ? helperId : undefined}
									/>
								}
							>
								<span className="truncate">{triggerLabel}</span>
								{profilesIsPending ? (
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
										value={profileSearch}
										onChange={(event) => {
											setProfileSearch(event.target.value);
											// scopeKey change resets the cursor stack inside the
											// pagination hook; no manual reset needed here.
										}}
										placeholder={t('search')}
										aria-label={t('search-profiles')}
										className="h-7 border-none bg-transparent shadow-none focus-visible:ring-0"
									/>
									{!isProfileSearchSettled || profilesIsPending ? (
										<LoadingSpinner />
									) : null}
								</div>
								{profiles.length > 0 ? (
									profiles.map((profile) => (
										<DropdownMenuCheckboxItem
											key={profile.id}
											checked={selectedIdSet.has(profile.id)}
											closeOnClick={false}
											showCheckbox
											onCheckedChange={(checked) => {
												toggleProfile(profile.id, Boolean(checked));
											}}
										>
											<span className="min-w-0 flex-1 truncate">
												{profile.name}
											</span>
											{profile.isDefault ? (
												<Badge variant="secondary">{t('default')}</Badge>
											) : null}
										</DropdownMenuCheckboxItem>
									))
								) : (
									<p className="px-3 py-2 text-[13px] text-muted-foreground">
										{profilesIsPending
											? t('loading-profiles')
											: t('no-profiles-available')}
									</p>
								)}
								<div className="flex items-center justify-between border-t px-1 py-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={!profilePagination.hasPreviousPage}
										onClick={profilePagination.retreat}
									>
										<IconChevronLeft aria-hidden="true" className="size-3.5" />
										{t('previous')}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={
											!hasNextPage ||
											!isProfileSearchSettled ||
											profilesIsPending
										}
										onClick={() => {
											if (typeof nextCursor === 'string') {
												profilePagination.advance(nextCursor);
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
								{selectedIds.map((selectedId) => (
									<span
										key={selectedId}
										className="publy-detail-chip publy-detail-chip--outline"
									>
										{knownNames.get(selectedId) ?? selectedId}
									</span>
								))}
							</div>
						) : null}

						{renderFieldHelper({ helper, isInvalid, helperId })}
					</div>
				);
			}}
		/>
	);
};
