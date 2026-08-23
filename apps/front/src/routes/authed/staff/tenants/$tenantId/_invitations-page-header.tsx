import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

/** Page title with the pending-invitations count chip plus the primary
 * "invite people" action. Extracted from the route component so it stays
 * reviewable in isolation. */
export function InvitationsPageHeader({
	tenant,
	onInvite,
}: {
	tenant: Pick<StaffTenantDetails, 'pendingInvitationsCount'>;
	onInvite: () => void;
}) {
	const { t } = useTranslation('common');

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="space-y-1">
				<h2 className="publy-type-page-title">
					{t('invitations')}
					{tenant.pendingInvitationsCount != null ? (
						<span className="ml-2 publy-profile-count-badge align-middle">
							{t('invitations-pending-count-chip', {
								count: tenant.pendingInvitationsCount,
							})}
						</span>
					) : null}
				</h2>
				<p className="publy-type-helper">
					{t('tenant-invitations-tab-description')}
				</p>
			</div>
			<Button type="button" size="sm" variant="default" onClick={onInvite}>
				<IconPlus aria-hidden="true" className="size-[15px]" />
				{t('invite-people')}
			</Button>
		</div>
	);
}
