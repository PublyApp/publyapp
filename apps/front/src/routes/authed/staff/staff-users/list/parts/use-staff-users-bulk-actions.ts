import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	getFailureMessage,
	isAbortFailure,
	isProblemFailure,
	toApiFailure,
} from '#app/lib/api-failure/index.ts';
import {
	useBulkDeleteStaffUsers,
	useBulkReactivateStaffUsers,
	useBulkSuspendStaffUsers,
	useFindStaffUser,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

export type StaffUsersBulkActionType = 'suspend' | 'reactivate' | 'delete';

type UseStaffUsersBulkActionsProps = {
	rowSelection: Record<string, boolean>;
	onSuccess: (type: StaffUsersBulkActionType) => void;
};

export const useStaffUsersBulkActions = ({
	rowSelection,
	onSuccess,
}: UseStaffUsersBulkActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const selectedUserIds = useMemo(() => {
		return Object.keys(rowSelection).filter((id) => rowSelection[id]);
	}, [rowSelection]);

	const invalidateStaffUsers = () => {
		void queryClient.invalidateQueries({
			queryKey: useFindStaffUser.getKey(),
		});
	};

	const { mutate: bulkSuspend, isPending: isBulkSuspending } =
		useBulkSuspendStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;

				if (failed > 0) {
					toast.warning(
						t('staff-user-bulk-suspend-partial-success', {
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('staff-user-bulk-suspend-success', {
							count: succeeded,
						}),
					);
				}

				onSuccess('suspend');
				invalidateStaffUsers();
			},
			onError: (error: unknown) => {
				const failure = toApiFailure(error);

				if (isAbortFailure(failure)) {
					return;
				}

				if (isProblemFailure(failure)) {
					toast.error(
						getFailureMessage(failure, {
							fallback: t('staff-user-bulk-suspend-failure'),
						}),
					);
					return;
				}

				toast.error(t('staff-user-bulk-suspend-failure'));
			},
		});

	const { mutate: bulkReactivate, isPending: isBulkReactivating } =
		useBulkReactivateStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;

				if (failed > 0) {
					toast.warning(
						t('staff-user-bulk-reactivate-partial-success', {
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('staff-user-bulk-reactivate-success', {
							count: succeeded,
						}),
					);
				}

				onSuccess('reactivate');
				invalidateStaffUsers();
			},
			onError: (error: unknown) => {
				const failure = toApiFailure(error);

				if (isAbortFailure(failure)) {
					return;
				}

				if (isProblemFailure(failure)) {
					toast.error(
						getFailureMessage(failure, {
							fallback: t('staff-user-bulk-reactivate-failure'),
						}),
					);
					return;
				}

				toast.error(t('staff-user-bulk-reactivate-failure'));
			},
		});

	const { mutate: bulkDelete, isPending: isBulkDeleting } =
		useBulkDeleteStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;

				if (failed > 0) {
					toast.warning(
						t('staff-user-bulk-delete-partial-success', {
							succeeded,
							failed,
						}),
					);
				} else {
					toast.success(
						t('staff-user-bulk-delete-success', {
							count: succeeded,
						}),
					);
				}

				onSuccess('delete');
				invalidateStaffUsers();
			},
			onError: (error: unknown) => {
				const failure = toApiFailure(error);

				if (isAbortFailure(failure)) {
					return;
				}

				if (isProblemFailure(failure)) {
					toast.error(
						getFailureMessage(failure, {
							fallback: t('staff-user-bulk-delete-failure'),
						}),
					);
					return;
				}

				toast.error(t('staff-user-bulk-delete-failure'));
			},
		});

	return {
		selectedUserIds,
		handleBulkSuspend: () => {
			bulkSuspend({ userIds: selectedUserIds });
		},
		handleBulkReactivate: () => {
			bulkReactivate({ userIds: selectedUserIds });
		},
		handleBulkDelete: () => {
			bulkDelete({ userIds: selectedUserIds });
		},
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	};
};
