const TENANT_USER_STATUS_ACTIVE = 'active';
const TENANT_USER_STATUS_GLOBALLY_SUSPENDED = 'globally_suspended';
const TENANT_USER_STATUS_SUSPENDED = 'suspended';

// The API surface is currently explicit for ACTIVE/SUSPENDED transitions on
// tenant memberships. Any other status value is treated as ambiguous to avoid
// accidental lifecycle actions we cannot confidently support.

export const getNormalizedTenantUserStatus = (
	value: string | null | undefined,
): string => value?.trim().toLowerCase() ?? '';

export const getMembershipActionLabel = (
	status: string,
): 'suspend' | 'reactivate' | null => {
	if (status === TENANT_USER_STATUS_ACTIVE) {
		return 'suspend';
	}

	if (status === TENANT_USER_STATUS_SUSPENDED) {
		return 'reactivate';
	}

	return null;
};

export type TenantUserDetailsActionState = {
	canChangeStatus: boolean;
	isGloballySuspended: boolean;
	isStatusActionPending: boolean;
	isRemoveActionPending: boolean;
	isAnyActionPending: boolean;
	membershipAction: 'suspend' | 'reactivate' | null;
	membershipActionDisabled: boolean;
};

export const getDetailsActionState = ({
	status,
	suspendIsPending,
	reactivateIsPending,
	removeIsPending,
}: {
	status: string | null | undefined;
	suspendIsPending: boolean;
	reactivateIsPending: boolean;
	removeIsPending: boolean;
}): TenantUserDetailsActionState => {
	const normalizedStatus = getNormalizedTenantUserStatus(status);
	const canSuspend = normalizedStatus === TENANT_USER_STATUS_ACTIVE;
	const canReactivate = normalizedStatus === TENANT_USER_STATUS_SUSPENDED;
	const isStatusActionPending = suspendIsPending || reactivateIsPending;
	const isGloballySuspended =
		normalizedStatus === TENANT_USER_STATUS_GLOBALLY_SUSPENDED;
	const membershipAction = getMembershipActionLabel(normalizedStatus);

	return {
		canChangeStatus: canSuspend || canReactivate,
		isGloballySuspended,
		isStatusActionPending,
		isRemoveActionPending: removeIsPending,
		isAnyActionPending: isStatusActionPending || removeIsPending,
		membershipAction,
		membershipActionDisabled:
			isStatusActionPending || isGloballySuspended || !membershipAction,
	};
};
