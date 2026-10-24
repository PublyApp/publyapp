import { IconListCheck } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import {
	MutedWhenSuperseded,
	ScheduledPublicationCause,
	ScheduledPublicationCustomized,
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
			cell: ({ row }) => {
				const { postId, postBodyPreview, superseded } = row.original;
				const content = (
					<span
						className="line-clamp-2 min-w-0"
						title={postBodyPreview ?? undefined}
					>
						{postBodyPreview ?? '—'}
					</span>
				);

				// The queue links a scheduled publication's post to its edit page
				// so the operator can resolve it directly from the queue (queue↔
				// calendar parity). Rows without a post id stay plain text.
				if (postId) {
					return (
						<MutedWhenSuperseded superseded={superseded}>
							<Link
								title={t('posts:publication-open-post')}
								to="/tenant/posts/$postId/edit"
								params={{ postId }}
								className="publy-record-link"
							>
								{content}
							</Link>
						</MutedWhenSuperseded>
					);
				}

				return (
					<MutedWhenSuperseded superseded={superseded}>
						{content}
					</MutedWhenSuperseded>
				);
			},
		},
		{
			id: 'account',
			header: t('queue-account-label'),
			enableSorting: false,
			meta: { width: '190px' },
			cell: ({ row }) => (
				<MutedWhenSuperseded superseded={row.original.superseded}>
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="min-w-0 truncate">
							{row.original.accountDisplayHandle ?? '—'}
						</span>
						<ScheduledPublicationCustomized
							customized={row.original.customized}
						/>
					</div>
				</MutedWhenSuperseded>
			),
		},
		{
			id: 'status',
			header: t('queue-status-label'),
			enableSorting: false,
			meta: { width: '132px' },
			cell: ({ row }) => (
				<MutedWhenSuperseded superseded={row.original.superseded}>
					<div className="flex flex-col items-start gap-1">
						<ScheduledPublicationStatus row={row.original} />
						<ScheduledPublicationCause
							status={row.original.status}
							cause={row.original.lastError}
							superseded={row.original.superseded}
						/>
					</div>
				</MutedWhenSuperseded>
			),
		},
		{
			id: 'scheduled_at',
			header: t('queue-scheduled-label'),
			enableSorting: false,
			meta: { width: '190px' },
			cell: ({ row }) => (
				<MutedWhenSuperseded superseded={row.original.superseded}>
					<ScheduledPublicationTime row={row.original} />
				</MutedWhenSuperseded>
			),
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
