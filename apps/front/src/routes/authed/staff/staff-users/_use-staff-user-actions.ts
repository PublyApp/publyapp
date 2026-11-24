import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
}: {
	userId: string;
	onLogout: () => void;
}) => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
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

		try {
			await navigate({ to: '/staff/staff-users' });
		} catch (error) {
			// navigation rejection after successful delete — don't reuse failure message
			logger.warn('Staff user delete navigation failed', error);
		}

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
		close,
	};
};
