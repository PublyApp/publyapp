import { useQueryClient } from '@tanstack/react-query';

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
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import {
	clearDeletedStaffUserRelatedQueries,
	invalidateStaffUserLifecycleQueries,
} from '#app/routes/authed/staff/staff-users/shared/staff-user-cache-helpers.ts';

import { getSuccessfulBulkStaffUserIds } from './staff-users-list-helpers.ts';

export type StaffUsersBulkActionType = 'suspend' | 'reactivate' | 'delete';

type UseStaffUsersBulkActionsProps = {
	selectedUserIds: string[];
	onSuccess: (type: StaffUsersBulkActionType) => void;
};

export const useStaffUsersBulkActions = ({
	selectedUserIds,
	onSuccess,
}: UseStaffUsersBulkActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const { mutate: bulkSuspend, isPending: isBulkSuspending } =
		useBulkSuspendStaffUsers({
			meta: { skipGlobalErrorHandler: true },
			onSuccess: async (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				const successfulUserIds = getSuccessfulBulkStaffUserIds({
					requestedUserIds: selectedUserIds,
					result,
				});

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
				await invalidateStaffUserLifecycleQueries({
					queryClient,
					userIds: successfulUserIds,
				});
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
			onSuccess: async (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				const successfulUserIds = getSuccessfulBulkStaffUserIds({
					requestedUserIds: selectedUserIds,
					result,
				});

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
				await invalidateStaffUserLifecycleQueries({
					queryClient,
					userIds: successfulUserIds,
				});
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
			onSuccess: async (result) => {
				const succeeded = result.succeededCount ?? 0;
				const failed = result.failedCount ?? 0;
				const successfulUserIds = getSuccessfulBulkStaffUserIds({
					requestedUserIds: selectedUserIds,
					result,
				});

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
				await invalidateStaffUserLifecycleQueries({
					queryClient,
					userIds: successfulUserIds,
					invalidateStaffProfilesList: true,
				});
				clearDeletedStaffUserRelatedQueries({
					queryClient,
					userIds: successfulUserIds,
				});
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
			if (selectedUserIds.length === 0) {
				return;
			}

			bulkSuspend({ userIds: selectedUserIds });
		},
		handleBulkReactivate: () => {
			if (selectedUserIds.length === 0) {
				return;
			}

			bulkReactivate({ userIds: selectedUserIds });
		},
		handleBulkDelete: () => {
			if (selectedUserIds.length === 0) {
				return;
			}

			bulkDelete({ userIds: selectedUserIds });
		},
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
	};
};
