import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';

import { formatTenantUserStatusLabel } from '../_tenant-details-shell';

export const TenantUserStatusCard = ({
	userStatus,
	canChangeStatus,
	membershipAction,
	membershipActionLabel,
	membershipActionDisabled,
	isStatusActionPending,
	isGloballySuspended,
	onMembershipAction,
}: {
	userStatus: string | null;
	canChangeStatus: boolean;
	membershipAction: 'suspend' | 'reactivate' | null;
	membershipActionLabel: string;
	membershipActionDisabled: boolean;
	isStatusActionPending: boolean;
	isGloballySuspended: boolean;
	onMembershipAction: (action: 'suspend' | 'reactivate') => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<Card className="space-y-4 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
						{t('tenant-membership-status')}
					</p>
					<p className="text-sm text-foreground">
						{formatTenantUserStatusLabel(userStatus, t)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{canChangeStatus ? (
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => {
								if (!membershipAction) {
									return;
								}

								onMembershipAction(membershipAction);
							}}
							disabled={membershipActionDisabled}
						>
							{membershipActionLabel}
							{isStatusActionPending ? '…' : ''}
						</Button>
					) : null}
				</div>
			</div>

			{!canChangeStatus ? (
				<p className="rounded-large border border-dashed border-border bg-card p-2 text-xs text-muted-foreground">
					{isGloballySuspended
						? t('membership-lifecycle-disabled-globally-suspended')
						: t('membership-lifecycle-unavailable-status')}
				</p>
			) : null}
		</Card>
	);
};
