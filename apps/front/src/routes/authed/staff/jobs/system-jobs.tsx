import { IconActivity } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { PageHeader } from '~/components/ui/product-page';
import {
	toStaffSystemJobDefinitionRows,
	useStaffTriggerSystemJobMutation,
	useStaffUpdateSystemJobEnabledMutation,
	useStaffUpdateSystemJobCronMutation,
	useStaffSystemJobDefinitionsQuery,
	invalidateStaffJobsQueries,
	type StaffSystemJobDefinitionRow,
} from '~/lib/query/staff-jobs';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { makeSystemJobColumns } from './_columns-system-jobs';
import {
	parseStaffJobsListSearchParams,
	type StaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
	type StaffJobsListSearchParamInput,
} from './_list-search-params';
import { useStaffJobPermissions } from './_permissions';

const DEFAULT_SIZE = 100;
// Server-side ordering for definitions is fixed; sort controls stay hidden
// because every column sets enableSorting: false.
const DEFAULT_SORT = { id: 'created_at', order: 'asc' as const };
const MAX_CRON_LENGTH = 100;

type CronDialogState = {
	row: StaffSystemJobDefinitionRow;
	draft: string;
	error: string | null;
};

const StaffJobsSystemJobsPage = () => {
	const { t, i18n } = useTranslation(['staff-jobs', 'common']);
	const locale = i18n?.language ?? 'en';
	const queryClient = useQueryClient();
	const permissions = useStaffJobPermissions();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [cronDialog, setCronDialog] = useState<CronDialogState | null>(null);

	const search = parseStaffJobsListSearchParams(
		Route.useSearch() as StaffJobsListSearchParamInput,
	);
	const navigate = Route.useNavigate();
	const onSearchChange = (next: StaffJobsListSearchParams): void => {
		void navigate({
			search: serializeStaffJobsListSearchParams(next),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: buildCursorResetKey(search),
	});

	const query = useStaffSystemJobDefinitionsQuery({
		isEnabled: search.isEnabled,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = toStaffSystemJobDefinitionRows(query.data?.data);

	const enabledMutation = useStaffUpdateSystemJobEnabledMutation();
	const cronMutation = useStaffUpdateSystemJobCronMutation();
	const triggerMutation = useStaffTriggerSystemJobMutation();

	const guardSession = (error: unknown): boolean => {
		if (shouldLogoutForFailure(error)) {
			setShouldLogout(true);
			return true;
		}

		return false;
	};

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
		[permissions.canUpdateSystemJob, enabledMutation, queryClient],
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

	const closeCronDialog = (): void => setCronDialog(null);

	const confirmCron = async (): Promise<void> => {
		if (!cronDialog || !permissions.canUpdateSystemJob) {
			closeCronDialog();
			return;
		}

		try {
			await cronMutation.mutateAsync({
				systemJobId: cronDialog.row.id,
				cronExpression: cronDialog.draft,
			});
		} catch (error) {
			setCronDialog({
				...cronDialog,
				error: getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
				}),
			});
			guardSession(error);
			return;
		}

		void invalidateStaffJobsQueries(queryClient);
		closeCronDialog();
	};

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
		[permissions.canTriggerSystemJob, triggerMutation, queryClient],
	);

	const columns = useMemo(
		() =>
			makeSystemJobColumns(t, locale, {
				canUpdateSystemJob: permissions.canUpdateSystemJob,
				canTriggerSystemJob: permissions.canTriggerSystemJob,
				permissionsPending: permissions.isPending,
				updateDenied: permissions.loadError || !permissions.canUpdateSystemJob,
				triggerDenied:
					permissions.loadError || !permissions.canTriggerSystemJob,
				isTogglePending: enabledMutation.isPending,
				onToggleEnabled,
				onTriggerNow: (row) => void onTriggerNow(row),
				onEditCron: openCronDialog,
			}),
		[
			t,
			locale,
			permissions,
			enabledMutation.isPending,
			onToggleEnabled,
			onTriggerNow,
			openCronDialog,
		],
	);
	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('system-page-title')}
				description={t('system-page-description')}
			/>
			<DataTable<StaffSystemJobDefinitionRow>
				testId="staff-jobs-system-table"
				ariaLabel={t('system-page-title')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: search.isEnabled !== undefined,
				}}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: query.data?.nextCursor != null,
					isPaginationPending: query.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(query.data?.nextCursor ?? undefined),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				emptyIcon={IconActivity}
				emptyTitle={t('common:no-audit-logs-yet')}
				emptyContent={t('common:no-audit-logs-description')}
				noMatchTitle={t('no-rows-match-title')}
				noMatchContent={t('no-rows-match-description')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
			/>

			<ConfirmDialog
				isOpen={cronDialog !== null}
				title={t('cron-dialog-title')}
				description={t('cron-dialog-description', {
					jobKey: cronDialog?.row.jobKey ?? '',
				})}
				confirmLabel={t('action-save-cron')}
				isPending={cronMutation.isPending}
				tone="primary"
				onConfirm={() => void confirmCron()}
				onOpenChange={(open) => {
					if (!open) {
						closeCronDialog();
					}
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="cron-expression">{t('cron-expression-label')}</Label>
					<Input
						id="cron-expression"
						value={cronDialog?.draft ?? ''}
						maxLength={MAX_CRON_LENGTH}
						onChange={(event) =>
							setCronDialog((current) =>
								current ? { ...current, draft: event.target.value } : current,
							)
						}
					/>
					{cronDialog?.error ? (
						<p role="alert" className="text-[13px] text-destructive">
							{cronDialog.error}
						</p>
					) : null}
				</div>
			</ConfirmDialog>
		</div>
	);
};

function buildCursorResetKey(
	search: ReturnType<typeof parseStaffJobsListSearchParams>,
): string {
	return [
		search.isEnabled === undefined ? '' : String(search.isEnabled),
		search.jobType ?? '',
		search.tenantId ?? '',
	].join('\u001f');
}

export const Route = createFileRoute('/_authed-layout/staff/jobs/system-jobs')({
	staticData: {
		i18nNamespaces: ['staff-jobs'],
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }],
	},
	validateSearch: (search) =>
		serializeStaffJobsListSearchParams(
			parseStaffJobsListSearchParams(search as StaffJobsListSearchParamInput),
		),
	component: StaffJobsSystemJobsPage,
});
