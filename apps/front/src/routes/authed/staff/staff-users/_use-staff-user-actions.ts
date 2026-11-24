import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
	invalidateStaffUsers,
	removeStaffUserDetails,
	useDeleteStaffUserMutation,
	useReactivateStaffUserMutation,
	useSuspendStaffUserMutation,
} from '~/lib/query/staff-users';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/** Runs a mutation; on failure flags a logout when needed and returns false.
 * No try/finally at call sites — the React Compiler cannot lower it yet. */
const runMutation = async (
	run: () => Promise<void>,
	onLogout: () => void,
): Promise<boolean> => {
	try {
		await run();
	} catch (error) {
		if (shouldLogoutForFailure(error)) {
			onLogout();
		}
		return false;
	}
	return true;
};

export const useStaffLifecycleAction = ({
	userId,
	canSuspend,
	canReactivate,
	onLogout,
}: {
	userId: string;
	canSuspend: boolean;
	canReactivate: boolean;
	onLogout: () => void;
}) => {
	const queryClient = useQueryClient();
	const suspendUser = useSuspendStaffUserMutation();
	const reactivateUser = useReactivateStaffUserMutation();
	const [isOpen, setOpen] = useState(false);

	const confirm = async () => {
		if (!canSuspend && !canReactivate) {
			setOpen(false);
			return;
		}

		const ok = await runMutation(async () => {
			await (canSuspend
				? suspendUser.mutateAsync({ userId })
				: reactivateUser.mutateAsync({ userId }));
		}, onLogout);
		setOpen(false);
		if (!ok) {
			return;
		}

		try {
			await invalidateStaffUsers(queryClient);
		} catch (error) {
			logger.warn('Staff user lifecycle invalidation failed', error);
		}
	};

	return {
		isOpen,
		setOpen,
		confirm,
		isPending: suspendUser.isPending || reactivateUser.isPending,
	};
};

export const useStaffDeleteAction = ({
	userId,
	onLogout,
	onDeleted,
}: {
	userId: string;
	onLogout: () => void;
	/** Runs the route change after a successful delete; the owner (the page)
	 * owns where to go and how to log a navigation failure. */
	onDeleted: () => Promise<void>;
}) => {
	const queryClient = useQueryClient();
	const deleteUser = useDeleteStaffUserMutation();
	const [isOpen, setOpen] = useState(false);
	const [confirmText, setConfirmText] = useState('');

	const close = () => {
		setOpen(false);
		setConfirmText('');
	};

	const confirm = async () => {
		const ok = await runMutation(async () => {
			await deleteUser.mutateAsync({ userId });
		}, onLogout);
		close();
		if (!ok) {
			return;
		}

		// Awaited before the cache cleanup so navigation still happens first.
		await onDeleted();

		removeStaffUserDetails(queryClient);
		void invalidateStaffUsers(queryClient);
	};

	return {
		isOpen,
		setOpen,
		confirmText,
		setConfirmText,
		isConfirmReady: confirmText.trim().toLowerCase() === 'delete',
		isPending: deleteUser.isPending,
		confirm,
	};
};
