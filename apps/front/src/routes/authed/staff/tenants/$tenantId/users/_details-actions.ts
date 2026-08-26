import type {
	ApiResponse,
	ReactivateTenantUserResult,
	SuspendTenantUserResult,
} from '@org/client-ts/models/index';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/**
 * Domain payloads the membership/remove mutations resolve to. The actions
 * below only await completion and never read the value, but the contract
 * stays honest instead of widening through `unknown`.
 */
type MembershipMutationResult =
	| ApiResponse
	| ReactivateTenantUserResult
	| SuspendTenantUserResult;

type MembershipMutationFn = (input: {
	tenantId: string;
	userId: string;
}) => Promise<MembershipMutationResult | undefined>;

export const performMembershipAction = async ({
	action,
	tenantId,
	userId,
	suspendAsync,
	reactivateAsync,
	invalidateQueries,
	setShouldLogout,
}: {
	action: 'suspend' | 'reactivate';
	tenantId: string;
	userId: string;
	suspendAsync: MembershipMutationFn;
	reactivateAsync: MembershipMutationFn;
	invalidateQueries: () => Promise<void>;
	setShouldLogout: (value: boolean) => void;
}): Promise<void> => {
	try {
		if (action === 'suspend') {
			await suspendAsync({ tenantId, userId });
		} else {
			await reactivateAsync({ tenantId, userId });
		}
	} catch (error) {
		if (shouldLogoutForFailure(error)) {
			setShouldLogout(true);
			return;
		}

		return;
	}

	await invalidateQueries();
};

export const performRemoveAction = async ({
	tenantId,
	userId,
	removeAsync,
	invalidateQueries,
	setShouldLogout,
	setPendingRemove,
	onRemoved,
}: {
	tenantId: string;
	userId: string;
	removeAsync: MembershipMutationFn;
	invalidateQueries: () => Promise<void>;
	setShouldLogout: (value: boolean) => void;
	setPendingRemove: (value: boolean) => void;
	onRemoved: () => void;
}): Promise<void> => {
	try {
		await removeAsync({ tenantId, userId });
	} catch (error) {
		if (shouldLogoutForFailure(error)) {
			setShouldLogout(true);
			return;
		}

		return;
	} finally {
		setPendingRemove(false);
	}

	await invalidateQueries();
	onRemoved();
};
