import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

type MembershipMutationFn = (input: {
	tenantId: string;
	userId: string;
}) => Promise<unknown>;

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
