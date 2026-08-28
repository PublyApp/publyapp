import { IconActivity } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { DetailRow, PageHeader } from '~/components/ui/product-page';
import { formatDateTime } from '~/lib/format-date-time';
import {
	invalidateStaffJobsQueries,
	staffDeadLetterDetailsQueryOptions,
	toStaffDeadLetterRows,
	useStaffDeadLettersQuery,
	type StaffDeadLetterRow,
} from '~/lib/query/staff-jobs';
import { useStaffRequeueDeadLetterMutation } from '~/lib/query/staff-jobs';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { makeDeadLetterColumns } from './_columns-dead-letter';
import {
	buildStaffJobsCursorResetKey,
	type StaffJobsListSearchParams,
	parseStaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
	type StaffJobsListSearchParamInput,
} from './_list-search-params';
import { useStaffJobPermissions } from './_permissions';
import { isPayloadRedacted, RedactionBanner } from './_redaction-banner';

const DEFAULT_SORT = { id: 'failed_at', order: 'desc' as const };
const DEFAULT_SIZE = 50;
const MAX_NOTE_LENGTH = 500;

const StaffJobsDeadLetterPage = () => {
	const { t, i18n } = useTranslation(['staff-jobs', 'common']);
	const locale = i18n?.language ?? 'en';
	const queryClient = useQueryClient();
	const permissions = useStaffJobPermissions();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [inspected, setInspected] = useState<StaffDeadLetterRow | null>(null);
	const [requeueTarget, setRequeueTarget] = useState<StaffDeadLetterRow | null>(
		null,
	);
	const [requeueNote, setRequeueNote] = useState('');
	const [requeueError, setRequeueError] = useState<string | null>(null);

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
		cursorResetKey: buildStaffJobsCursorResetKey(search),
	});

	const query = useStaffDeadLettersQuery({
		externalStateStatus: search.externalStateStatus,
		jobType: search.jobType,
		tenantId: search.tenantId,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = toStaffDeadLetterRows(query.data?.data);

	const detailQuery = useStaffDeadLetterDetailQuery(inspected?.id);

	const requeueMutation = useStaffRequeueDeadLetterMutation();

	const closeRequeueDialog = (): void => {
		setRequeueTarget(null);
		setRequeueNote('');
		setRequeueError(null);
	};

	const confirmRequeue = async (): Promise<void> => {
		// An in-flight permission request (or a failed one) leaves the real
		// grant unknown: a click must not silently vanish. Gate on the same
		// flag the column uses so the button is never clickable while the
		// grant is unresolved.
		if (!requeueTarget || !permissions.canRequeue) {
			closeRequeueDialog();
			return;
		}

		try {
			await requeueMutation.mutateAsync({
				deadLetterId: requeueTarget.id,
				note: requeueNote,
			});
		} catch (error) {
			setRequeueError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
				}),
			);
			if (shouldLogoutForFailure(error)) {
				closeRequeueDialog();
				setShouldLogout(true);
			}
			return;
		}

		void invalidateStaffJobsQueries(queryClient);
		closeRequeueDialog();
	};

	const columns = useMemo(
		() =>
			makeDeadLetterColumns(
				t,
				locale,
				(row) => setInspected(row),
				(row) => setRequeueTarget(row),
				{
					permissionsPending: permissions.isPending,
					permissionsDenied: permissions.loadError || !permissions.canRequeue,
					title: permissions.isPending
						? t('action-permission-checking')
						: t('action-permission-denied'),
				},
			),
		[
			t,
			locale,
			permissions.isPending,
			permissions.loadError,
			permissions.canRequeue,
		],
	);
	const renderPayloadSection = (): ReactNode => {
		if (!detail?.payload) {
			return null;
		}

		if (isPayloadRedacted(detail.payload)) {
			return <RedactionBanner label={t('redaction-banner')} />;
		}

		return (
			<pre className="max-h-48 overflow-auto rounded-[var(--publy-radius-sm)] bg-muted p-3 font-mono text-xs">
				{detail.payload}
			</pre>
		);
	};

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const hasActiveFilters = Boolean(
		search.externalStateStatus || search.jobType || search.tenantId,
	);

	const detail = detailQuery.data;

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('dl-page-title')}
				description={t('dl-page-description')}
			/>
			<DataTable<StaffDeadLetterRow>
				testId="staff-jobs-dead-letter-table"
				ariaLabel={t('dl-page-title')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: hasActiveFilters,
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
				isOpen={requeueTarget !== null}
				title={t('requeue-confirm-title')}
				description={
					requeueTarget?.jobType
						? t('requeue-confirm-description', {
								jobType: requeueTarget.jobType,
							})
						: t('requeue-confirm-description-generic')
				}
				confirmLabel={t('common:action-requeue')}
				isPending={requeueMutation.isPending}
				tone="primary"
				onConfirm={() => void confirmRequeue()}
				onOpenChange={(open) => {
					if (!open) {
						closeRequeueDialog();
					}
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="requeue-note">{t('requeue-note-label')}</Label>
					<Input
						id="requeue-note"
						value={requeueNote}
						maxLength={MAX_NOTE_LENGTH}
						onChange={(event) => setRequeueNote(event.target.value)}
					/>
					{requeueError ? (
						<p role="alert" className="text-[13px] text-destructive">
							{requeueError}
						</p>
					) : null}
				</div>
			</ConfirmDialog>

			<Drawer
				open={inspected !== null}
				onOpenChange={(open) => {
					if (!open) {
						setInspected(null);
					}
				}}
			>
				<DrawerContent data-testid="staff-jobs-dead-letter-drawer">
					<DrawerHeader>
						<DrawerTitle>{t('dl-drawer-title')}</DrawerTitle>
						<DrawerDescription>{inspected?.jobType ?? ''}</DrawerDescription>
					</DrawerHeader>
					<DrawerBody>
						{inspected ? (
							<>
								{renderPayloadSection()}
								<DetailRow
									label={t('common:column-attempts')}
									value={detail?.attempts ?? inspected.attempts}
								/>
								<DetailRow
									label={t('detail-last-error')}
									value={
										detail?.lastError ??
										inspected.lastError ??
										t('common:no-value')
									}
								/>
								<DetailRow
									label={t('common:column-failed-at')}
									value={formatDateTime(
										detail?.failedAt ?? inspected.failedAt,
										locale,
									)}
								/>
							</>
						) : null}
					</DrawerBody>
				</DrawerContent>
			</Drawer>
		</div>
	);
};

/** Detail fetch is only meaningful while a row is open — keep it disabled
 * otherwise so opening the dashboard never fans out one request per row.
 * Hooks stay top-level imports; this wrapper just pins the `enabled` flag. */
function useStaffDeadLetterDetailQuery(deadLetterId: string | undefined) {
	return useQuery({
		queryKey: staffDeadLetterDetailsQueryOptions.queryKey({
			deadLetterId: deadLetterId ?? '',
		}),
		queryFn: () =>
			staffDeadLetterDetailsQueryOptions.fetcher({
				deadLetterId: deadLetterId ?? '',
			}),
		enabled: Boolean(deadLetterId),
	});
}

export const Route = createFileRoute('/_authed-layout/staff/jobs/dead-letter')({
	staticData: {
		i18nNamespaces: ['staff-jobs'],
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-jobs' }],
	},
	validateSearch: (search) =>
		serializeStaffJobsListSearchParams(
			parseStaffJobsListSearchParams(search as StaffJobsListSearchParamInput),
		),
	component: StaffJobsDeadLetterPage,
});
