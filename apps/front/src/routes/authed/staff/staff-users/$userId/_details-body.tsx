import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { useStaffUserRolesQuery } from '~/lib/query/staff-users';

import {
	ConfirmHeaderInfo,
	DeleteConfirmField,
} from '../../_staff-user-delete-confirm';
import { StaffUserIdentityHeader } from '../../_staff-user-identity-header';
import type {
	useStaffDeleteAction,
	useStaffLifecycleAction,
} from '../_use-staff-user-actions';
import {
	getActiveSection,
	getSuspendDialogKeys,
	getSuspendLabelKey,
} from './_lifecycle';
import type { StaffUserOverviewContextValue } from './_overview-context';

type Details = StaffUserOverviewContextValue['user'];

type Props = {
	user: Details;
	userId: string;
	locale: string;
	pathname: string;
	rolesQuery: ReturnType<typeof useStaffUserRolesQuery>;
	canSuspend: boolean;
	canReactivate: boolean;
	lifecycle: ReturnType<typeof useStaffLifecycleAction>;
	deletion: ReturnType<typeof useStaffDeleteAction>;
};

const DeleteUserDialog = ({
	user,
	deletion,
}: {
	user: Details;
	deletion: Props['deletion'];
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<ConfirmDialog
			isOpen={deletion.isOpen}
			title={t('confirm-delete-staff-user-title')}
			description={t('confirm-delete-staff-user-message')}
			confirmLabel={t('common:delete')}
			tone="danger"
			isPending={deletion.isPending}
			isConfirmDisabled={!deletion.isConfirmReady}
			onConfirm={() => {
				if (deletion.isConfirmReady) {
					void deletion.confirm();
				}
			}}
			onOpenChange={(isOpen) => {
				deletion.setOpen(isOpen);
				if (!isOpen) {
					deletion.setConfirmText('');
				}
			}}
		>
			<div className="space-y-2">
				<ConfirmHeaderInfo
					name={user.displayName}
					email={user.email}
					avatarUrl={user.avatarUrl}
				/>
				<DeleteConfirmField
					value={deletion.confirmText}
					onChange={(next) => {
						deletion.setConfirmText(next);
					}}
				/>
			</div>
		</ConfirmDialog>
	);
};

export const StaffUserDetailsBody = ({
	user,
	userId,
	locale,
	pathname,
	rolesQuery,
	canSuspend,
	canReactivate,
	lifecycle,
	deletion,
}: Props) => {
	const { t } = useTranslation(['staff-users', 'common']);

	// Not memoized: the Provider re-renders only with this page and the overview
	// tab reads the same query data, so the extra renders stay local.
	const overviewContextValue: StaffUserOverviewContextValue = {
		user,
		locale,
		query: rolesQuery,
		maxRolesPerUser: rolesQuery.data?.maxRolesPerUser ?? 0,
		canSuspend,
		canReactivate,
		suspendLabelKey: getSuspendLabelKey(user.status),
		suspendDescription: t(getSuspendDialogKeys(user.status).descriptionKey),
		isDeletePending: deletion.isPending,
		onOpenSuspendDialog: () => {
			lifecycle.setOpen(true);
		},
		onOpenDeleteDialog: () => {
			deletion.setOpen(true);
		},
	};

	return (
		<div
			className="publy-detail-page space-y-5"
			data-testid="staff-user-details-page"
		>
			<StaffUserIdentityHeader
				user={user}
				userId={userId}
				suspendDialogOpen={lifecycle.isOpen}
				onSuspendDialogOpenChange={(open) => lifecycle.setOpen(open)}
				onConfirmLifecycle={() => {
					void lifecycle.confirm();
				}}
				isLifecyclePending={lifecycle.isPending}
				getSuspendDialogKeys={getSuspendDialogKeys}
				getSuspendLabelKey={getSuspendLabelKey}
				activeSection={getActiveSection(pathname)}
				overviewContextValue={overviewContextValue}
			/>
			<DeleteUserDialog user={user} deletion={deletion} />
		</div>
	);
};
