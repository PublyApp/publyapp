import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { StaffTenantUserDetails } from '~/lib/query/staff-tenant-users';

import {
	DetailItem,
	formatDateTime,
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
} from '../_tenant-details-shell';

/** Lifecycle state of the user's membership, resolved by the caller:
 * - 'changeable': suspend/reactivate available (action says which)
 * - 'globally-suspended' / 'locked': no membership action possible
 */
export type MembershipLifecycle =
	| { kind: 'changeable'; action: 'suspend' | 'reactivate' }
	| { kind: 'globally-suspended' }
	| { kind: 'locked' };

type TenantUserDetailCardsProps = {
	user: StaffTenantUserDetails;
	tenantId: string;
	membershipLifecycle: MembershipLifecycle;
	membershipActionLabel: string;
	onMembershipAction: () => void;
	onRequestRemove: () => void;
	onConfirmRemove: () => void;
	onRemoveOpenChange: (open: boolean) => void;
	pendingRemove: boolean;
	statusPending: boolean;
	removePending: boolean;
};

/** The membership-status, removal, identity and activity cards of the
 * staff tenant-user details page. Extracted so each render unit stays
 * reviewable in isolation. */
export const TenantUserDetailCards = ({
	user,
	tenantId,
	membershipLifecycle,
	membershipActionLabel,
	statusPending,
	removePending,
	onMembershipAction,
	onRequestRemove,
	onConfirmRemove,
	onRemoveOpenChange,
	pendingRemove,
}: TenantUserDetailCardsProps) => {
	const { t, i18n } = useTranslation('common');

	return (
		<>
			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
							{t('tenant-membership-status')}
						</p>
						<p className="text-sm text-foreground">
							{formatTenantUserStatusLabel(user.status, t)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						{membershipLifecycle.kind === 'changeable' ? (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={onMembershipAction}
								disabled={statusPending}
							>
								{membershipActionLabel}
								{statusPending ? '…' : ''}
							</Button>
						) : null}
					</div>
				</div>

				{membershipLifecycle.kind !== 'changeable' ? (
					<p className="rounded-large border border-dashed border-border bg-card p-2 text-xs text-muted-foreground">
						{membershipLifecycle.kind === 'globally-suspended'
							? t('membership-lifecycle-disabled-globally-suspended')
							: t('membership-lifecycle-unavailable-status')}
					</p>
				) : null}
			</Card>

			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
							{t('tenant-user-removal')}
						</p>
						<p className="text-sm text-foreground">
							{t('remove-user-from-tenant-description')}
						</p>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={onRequestRemove}
						disabled={statusPending || removePending}
					>
						{t('remove-from-tenant')}
						{removePending ? '…' : ''}
					</Button>
				</div>
			</Card>

			<ConfirmDialog
				isOpen={pendingRemove}
				title={t('remove-tenant-user-confirm-title')}
				description={t('remove-tenant-user-confirm-description')}
				confirmLabel={t('remove')}
				isPending={removePending}
				onConfirm={() => {
					onConfirmRemove();
				}}
				onOpenChange={onRemoveOpenChange}
			/>

			<Card className="space-y-4 p-5">
				<div className="grid gap-4 md:grid-cols-2">
					<DetailItem label={t('email')} value={user.email} />
					<DetailItem
						label={t('account-level')}
						value={formatTenantUserLevelLabel(user.accountLevel, t)}
					/>
					<DetailItem
						label={t('status')}
						value={formatTenantUserStatusLabel(user.status, t)}
					/>
					<DetailItem label={t('user-id')} value={user.id} />
					{/* W6-GUARDS (tests F7 / users-auth F11): the API's own
								`tenantId` is nullable in the response type, but this route is
								already scoped to a validated tenant via `Route.useParams()` —
								sourcing the display value from the ROUTE removes the fabricated
								'—' placeholder for a required identity field entirely, instead
								of tolerating a null API value. */}
					<DetailItem label={t('tenant-id')} value={tenantId} />
					{/* data-honesty-ignore: avatarUrl is a documented OPTIONAL field — a user with no uploaded avatar has none, this is not fabricated identity data */}
					<DetailItem label={t('avatar-url')} value={user.avatarUrl ?? '—'} />
				</div>
			</Card>

			<Card className="space-y-4 p-5">
				<div className="space-y-1">
					<p className="text-lg font-semibold text-foreground">
						{t('activity')}
					</p>
					<p className="text-sm text-muted-foreground">
						{t('tenant-user-activity-description')}
					</p>
				</div>
				<div className="grid gap-4">
					{user.createdAt ? (
						<DetailItem
							label={t('created')}
							value={formatDateTime(user.createdAt, i18n.language)}
						/>
					) : null}
					{user.updatedAt ? (
						<DetailItem
							label={t('updated')}
							value={formatDateTime(user.updatedAt, i18n.language)}
						/>
					) : null}
					{!user.createdAt && !user.updatedAt ? (
						<div className="rounded-large border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
							{t('tenant-user-no-timestamps')}
						</div>
					) : null}
				</div>
			</Card>
		</>
	);
};
