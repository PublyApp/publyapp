import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
	invalidateStaffJobsQueries,
	useStaffTriggerSystemJobMutation,
	useStaffUpdateSystemJobCronMutation,
	useStaffUpdateSystemJobEnabledMutation,
	type StaffSystemJobDefinitionRow,
} from '~/lib/query/staff-jobs';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import type { StaffJobPermissions } from './_permissions';
import type { CronDialogState } from './_system-cron-dialog';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The system-job mutations and their schedule dialog state, kept out of the
 * page component so it stays under `react-doctor/no-giant-component`. The
 * permission gating is unchanged: a denied action is never called.
 */
export const useSystemJobActions = ({
	t,
	permissions,
	queryClient,
	onSessionExpired,
}: {
	t: Translate;
	permissions: StaffJobPermissions;
	queryClient: QueryClient;
	onSessionExpired: () => void;
}) => {
	const [cronDialog, setCronDialog] = useState<CronDialogState | null>(null);
	const enabledMutation = useStaffUpdateSystemJobEnabledMutation();
	const cronMutation = useStaffUpdateSystemJobCronMutation();
	const triggerMutation = useStaffTriggerSystemJobMutation();

	const guardSession = useCallback(
		(error: unknown): boolean => {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return true;
			}
			return false;
		},
		[onSessionExpired],
	);

	const onToggleEnabled = useCallback(
		(row: StaffSystemJobDefinitionRow, next: boolean): void => {
			if (!permissions.canUpdateSystemJob) {
				return;
			}

			void enabledMutation
				.mutateAsync({ systemJobId: row.id, isEnabled: next })
				.then(() => {
					void invalidateStaffJobsQueries(queryClient);
				})
				.catch((error) => {
					guardSession(error);
				});
		},
		[
			permissions.canUpdateSystemJob,
			enabledMutation,
			queryClient,
			guardSession,
		],
	);

	const openCronDialog = useCallback(
		(row: StaffSystemJobDefinitionRow): void => {
			if (!permissions.canUpdateSystemJob) {
				return;
			}
			setCronDialog({ row, draft: row.cronExpression ?? '', error: null });
		},
		[permissions.canUpdateSystemJob],
	);

	const closeCronDialog = useCallback((): void => setCronDialog(null), []);

	const updateDraft = useCallback(
		(draft: string): void =>
			setCronDialog((current) =>
				current ? { ...current, draft, error: null } : current,
			),
		[],
	);

	const confirmCron = useCallback(async (): Promise<void> => {
		if (!cronDialog || !permissions.canUpdateSystemJob) {
			setCronDialog(null);
			return;
		}

		try {
			await cronMutation.mutateAsync({
				systemJobId: cronDialog.row.id,
				cronExpression: cronDialog.draft,
			});
		} catch (error) {
			setCronDialog((current) =>
				current
					? {
							...current,
							error: getFailureMessage(toApiFailure(error), {
								fallback: t('common:an-error-occurred'),
							}),
						}
					: current,
			);
			guardSession(error);
			return;
		}

		void invalidateStaffJobsQueries(queryClient);
		setCronDialog(null);
	}, [
		cronDialog,
		permissions.canUpdateSystemJob,
		cronMutation,
		queryClient,
		t,
		guardSession,
	]);

	const onTriggerNow = useCallback(
		async (row: StaffSystemJobDefinitionRow): Promise<void> => {
			if (!permissions.canTriggerSystemJob) {
				return;
			}

			try {
				await triggerMutation.mutateAsync({ systemJobId: row.id });
			} catch (error) {
				guardSession(error);
				return;
			}

			void invalidateStaffJobsQueries(queryClient);
		},
		[
			permissions.canTriggerSystemJob,
			triggerMutation,
			queryClient,
			guardSession,
		],
	);

	return {
		cronDialog,
		enabledPending: enabledMutation.isPending,
		cronPending: cronMutation.isPending,
		onToggleEnabled,
		openCronDialog,
		closeCronDialog,
		updateDraft,
		confirmCron: () => void confirmCron(),
		onTriggerNow: (row: StaffSystemJobDefinitionRow) => void onTriggerNow(row),
	};
};
