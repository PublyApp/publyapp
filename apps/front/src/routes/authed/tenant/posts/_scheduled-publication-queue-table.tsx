import { IconListCheck } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import {
	ScheduledPublicationStatus,
	ScheduledPublicationTime,
} from './_scheduled-publication-display';

type QueuePagination = {
	pageIndex: number;
	size: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	isPaginationPending: boolean;
	onNextPage: () => void;
	onPreviousPage: () => void;
	onSizeChange: (size: number) => void;
};

const ignoreSortChange = () => undefined;

export const ScheduledPublicationQueueTable = ({
	query,
	rows,
	pagination,
}: {
	query: Pick<
		UseQueryResult,
		'isPending' | 'isError' | 'isFetching' | 'refetch'
	>;
	rows: ScheduledPublicationRow[];
	pagination: QueuePagination;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const columns: ColumnDef<ScheduledPublicationRow>[] = [
		{
			id: 'post',
			header: t('queue-post-label'),
			enableSorting: false,
			cell: ({ row }) => (
				<span
					className="line-clamp-2 min-w-0"
					title={row.original.postBodyPreview ?? undefined}
				>
					{row.original.postBodyPreview ?? '—'}
				</span>
			),
		},
		{
			id: 'account',
			header: t('queue-account-label'),
			enableSorting: false,
			meta: { width: '190px' },
			cell: ({ row }) => row.original.accountDisplayHandle ?? '—',
		},
		{
			id: 'status',
			header: t('queue-status-label'),
			enableSorting: false,
			meta: { width: '132px' },
			cell: ({ row }) => (
				<ScheduledPublicationStatus status={row.original.status} />
			),
		},
		{
			id: 'scheduled_at',
			header: t('queue-scheduled-label'),
			enableSorting: false,
			meta: { width: '190px' },
			cell: ({ row }) => <ScheduledPublicationTime row={row.original} />,
		},
	];

	return (
		<DataTable
			testId="tenant-posts-queue-table"
			ariaLabel={t('common:queue')}
			columns={columns}
			rows={rows}
			queryState={{
				isPending: query.isPending,
				isError: query.isError,
				onRetry: () => void query.refetch(),
				hasActiveSearch: false,
			}}
			pagination={{
				pageIndex: pagination.pageIndex,
				hasPreviousPage: pagination.hasPreviousPage,
				hasNextPage: pagination.hasNextPage,
				isPaginationPending: pagination.isPaginationPending,
				onNextPage: pagination.onNextPage,
				onPreviousPage: pagination.onPreviousPage,
			}}
			emptyIcon={IconListCheck}
			emptyTitle={t('queue-empty-title')}
			emptyContent={t('queue-empty-description')}
			sort={{ id: 'scheduled_at', order: 'asc' }}
			onSortChange={ignoreSortChange}
			size={pagination.size}
			onSizeChange={pagination.onSizeChange}
			getRowLabel={(row) => row.postBodyPreview ?? row.id}
		/>
	);
};
