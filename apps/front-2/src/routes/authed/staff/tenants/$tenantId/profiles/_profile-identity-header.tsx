import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import type { StaffTenantProfileDetails } from '~/lib/query/staff-tenant-profiles';

import { getRelativeTimeParts } from '../_tenant-details-shell';
import {
	deriveTenantProfileCardStyle,
	tenantProfileTypeChipClassName,
} from '../profiles';

export const ProfileIdentityHeader = ({
	profile,
	permissionCount,
	onEdit,
}: {
	profile: StaffTenantProfileDetails;
	permissionCount: number;
	onEdit: () => void;
}) => {
	const { t } = useTranslation('common');
	const { Icon: ProfileIcon, tone: profileTone } = deriveTenantProfileCardStyle(
		profile.name,
	);
	const updatedRelativeParts = getRelativeTimeParts(profile.updatedAt);

	return (
		<header
			className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
			data-testid="staff-tenant-profile-identity"
		>
			<div className="flex min-w-0 items-start gap-4">
				<span className="publy-profile-detail-tile" data-tone={profileTone}>
					<ProfileIcon aria-hidden="true" />
				</span>
				<div className="min-w-0 space-y-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-semibold text-foreground">
							{profile.name}
						</h1>
						<span className={tenantProfileTypeChipClassName(profile.isDefault)}>
							{profile.isDefault ? t('system-profile') : t('custom-profile')}
						</span>
					</div>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{profile.description ?? t('no-description-provided')}
					</p>
					<p className="text-xs text-muted-foreground">
						{t('tenant-member-count', {
							count: profile.userAccountCount,
						})}
						{' · '}
						{t('tenant-permission-count', {
							count: permissionCount,
						})}
						{updatedRelativeParts ? (
							<>
								{' · '}
								{t('profile-updated-relative', {
									time: t(updatedRelativeParts.key, {
										count: updatedRelativeParts.count,
									}),
								})}
							</>
						) : null}
					</p>
				</div>
			</div>

			<Button type="button" variant="outline" onClick={onEdit}>
				{t('edit-details')}
			</Button>
		</header>
	);
};
