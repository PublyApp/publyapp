import { IconEye, IconPencil, IconTrash } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { Card } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { EntityHeaderSkeleton } from '~/components/ui/detail-skeleton';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import type { StaffTenantProfileRow } from '~/lib/query/staff-tenant-profiles';
import { cn } from '~/lib/utils';

import { deriveTenantProfileCardStyle } from './_profile-card-style';
import { tenantProfileTypeChipClassName } from './_profile-type-chip';

export const ProfileCardGridSkeleton = ({ testId }: { testId: string }) => (
	<div className="publy-profile-card-grid" data-testid={`${testId}-loading`}>
		{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map((key) => (
			<Card key={key} className="flex flex-col gap-3 p-4">
				<EntityHeaderSkeleton
					orientation="stacked"
					tileClassName="size-10 rounded-[10px]"
					lines={['h-3 w-2/3', 'h-3 w-full', 'h-3 w-1/3']}
				/>
			</Card>
		))}
	</div>
);

export const ProfileRowActions = ({
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

export const ProfileCard = ({
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
