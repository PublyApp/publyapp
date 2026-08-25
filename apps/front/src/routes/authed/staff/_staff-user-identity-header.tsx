import { IconArrowLeft, IconPencil } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';

import { ConfirmHeaderInfo } from './_staff-user-delete-confirm';
import {
	StaffUserSectionTabs,
	type StaffUserSection,
} from './_staff-user-section-tabs';
import type { StaffUserOverviewContextValue } from './staff-users/$userId/_overview-context';
import {
	formatAccountLevelLabel,
	formatStaffStatusLabel,
} from './staff-users/status-labels';

type HeaderUser = {
	displayName: string;
	email: string;
	avatarUrl: string | null;
	accountLevel: string | null;
	status: string | null;
};

/** Identity header of the staff user details page: back link, avatar,
 * name with status/level pills, edit link and the suspend/reactivate
 * confirm dialog. Extracted so each render unit stays reviewable. */
export const StaffUserIdentityHeader = ({
	user,
	userId,
	suspendDialogOpen,
	onSuspendDialogOpenChange,
	onConfirmLifecycle,
	isLifecyclePending,
	getSuspendDialogKeys,
	getSuspendLabelKey,
	activeSection,
	overviewContextValue,
}: {
	user: HeaderUser;
	userId: string;
	suspendDialogOpen: boolean;
	onSuspendDialogOpenChange: (open: boolean) => void;
	onConfirmLifecycle: () => void;
	isLifecyclePending: boolean;
	getSuspendDialogKeys: (status: string | null) => {
		titleKey: string;
		descriptionKey: string;
	};
	getSuspendLabelKey: (status: string | null) => string;
	activeSection: StaffUserSection;
	overviewContextValue: StaffUserOverviewContextValue;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<>
			<div className="space-y-3">
				<Link to="/staff/staff-users" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-users')}
				</Link>
			</div>
			<div className="space-y-1" data-testid="staff-user-details-heading">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="h-14 w-14">
							<PersonAvatar
								name={user.displayName}
								avatarUrl={user.avatarUrl}
								size="lg"
							/>
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
									{user.displayName}
								</h1>
								{user.accountLevel ? (
									<StatusPill tone="neutral">
										{formatAccountLevelLabel(user.accountLevel, t)}
									</StatusPill>
								) : null}
								{user.status ? (
									<StatusPill tone={statusPillTone(user.status)}>
										{formatStaffStatusLabel(user.status, t)}
									</StatusPill>
								) : null}
							</div>
							<p className="max-w-3xl text-[13px] text-muted-foreground">
								{user.email || t('common:no-email-address')}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Link
							to="/staff/staff-users/$userId/edit"
							params={{ userId }}
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							<IconPencil className="size-4" />
							{t('common:edit')}
						</Link>
						<ConfirmDialog
							isOpen={suspendDialogOpen}
							title={t(getSuspendDialogKeys(user.status).titleKey)}
							description={t(getSuspendDialogKeys(user.status).descriptionKey)}
							confirmLabel={t(`common:${getSuspendLabelKey(user.status)}`)}
							isPending={isLifecyclePending}
							onConfirm={() => {
								onConfirmLifecycle();
							}}
							onOpenChange={onSuspendDialogOpenChange}
						>
							<ConfirmHeaderInfo
								name={user.displayName}
								email={user.email || t('common:no-email-address')}
								avatarUrl={user.avatarUrl}
							/>
						</ConfirmDialog>
					</div>
				</div>

				<StaffUserSectionTabs
					userId={userId}
					activeSection={activeSection}
					contextValue={overviewContextValue}
				/>
			</div>
		</>
	);
};
