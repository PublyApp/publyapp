import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	toStaffTenantProfileRows,
	useStaffTenantProfilesQuery,
} from '~/lib/query/staff-tenant-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

export const InviteProfileSelect = ({
	tenantId,
	name,
	label,
	isDisabled = false,
	onSessionExpired,
}: {
	tenantId: string;
	name: string;
	label: string;
	isDisabled?: boolean;
	onSessionExpired: () => void;
}) => {
	const { control } = useFormContext();
	const { t } = useTranslation('common');
	const labelId = useId();
	const helperId = `${labelId}-helper`;
	const profilesQuery = useStaffTenantProfilesQuery({
		tenantId,
		sortId: 'name',
		sortOrder: 'asc',
		size: 100,
	});
	const profiles = toStaffTenantProfileRows(profilesQuery.data?.data);

	useEffect(() => {
		if (profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error)) {
			onSessionExpired();
		}
	}, [onSessionExpired, profilesQuery.error, profilesQuery.isError]);

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const selectedIds = toStringArray(field.value);
				const selectedProfiles = profiles.filter((profile) =>
					selectedIds.includes(profile.id),
				);
				const queryError = profilesQuery.isError
					? getFailureMessage(toApiFailure(profilesQuery.error), {
							fallback: t('unable-to-load-profiles'),
						})
					: '';
				const helper = error?.message ?? queryError;
				const isInvalid = Boolean(error || queryError);
				let triggerLabel = t('select-profiles');
				if (profilesQuery.isPending) {
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
										disabled={isDisabled || profilesQuery.isPending}
										aria-labelledby={labelId}
										aria-invalid={isInvalid || undefined}
										aria-describedby={helper ? helperId : undefined}
									/>
								}
							>
								<span className="truncate">{triggerLabel}</span>
								{profilesQuery.isPending ? (
									<LoadingSpinner />
								) : (
									<IconChevronDown aria-hidden="true" className="size-3" />
								)}
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-72">
								{profiles.length > 0 ? (
									profiles.map((profile) => (
										<DropdownMenuCheckboxItem
											key={profile.id}
											checked={selectedIds.includes(profile.id)}
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
										{t('no-profiles-available')}
									</p>
								)}
							</DropdownMenuContent>
						</DropdownMenu>

						{selectedProfiles.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{selectedProfiles.map((profile) => (
									<span
										key={profile.id}
										className="publy-detail-chip publy-detail-chip--outline"
									>
										{profile.name}
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
