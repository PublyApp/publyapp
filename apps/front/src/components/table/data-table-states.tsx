import type { TablerIcon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';

import type { TableBodyState } from './table-body-state';
import type { TableRowHeight } from './table-row-height';

const SKELETON_ROW_KEYS = [
	'sk-1',
	'sk-2',
	'sk-3',
	'sk-4',
	'sk-5',
	'sk-6',
	'sk-7',
] as const;

export type DataTableStatesProps = {
	testId: string;
	bodyState: TableBodyState;
	resolvedRowHeight: TableRowHeight;
	onRetry: () => void;
	errorContent?: ReactNode;
	emptyContent?: ReactNode;
	noMatchContent?: ReactNode;
	errorIcon?: TablerIcon;
	errorTitle?: string;
	emptyIcon?: TablerIcon;
	emptyTitle?: string;
	emptyActions?: ReactNode;
	noMatchIcon?: TablerIcon;
	noMatchTitle?: string;
};

/** The non-row bodies a DataTable can show: loading skeleton, error, empty and
 * no-match surfaces. Extracted from `DataTable` verbatim — same markup, same
 * test ids, same copy fallbacks. */
export const DataTableStates = ({
	testId,
	bodyState,
	resolvedRowHeight,
	onRetry,
	errorContent,
	emptyContent,
	noMatchContent,
	errorIcon,
	errorTitle,
	emptyIcon,
	emptyTitle,
	emptyActions: emptyActionsProp,
	noMatchIcon,
	noMatchTitle,
}: DataTableStatesProps) => {
	const { t } = useTranslation('common');

	let errorDescription: string | undefined;
	if (typeof errorContent === 'string') {
		errorDescription = errorContent;
	} else if (!errorContent) {
		errorDescription = t('list-error-default-description');
	}
	const errorActions =
		typeof errorContent !== 'string' && errorContent ? errorContent : undefined;

	const emptyDescription =
		typeof emptyContent === 'string'
			? emptyContent
			: t('list-empty-default-description');
	const emptyActions =
		emptyActionsProp ??
		(typeof emptyContent !== 'string' && emptyContent
			? emptyContent
			: undefined);

	const noMatchDescription =
		typeof noMatchContent === 'string'
			? noMatchContent
			: t('list-no-match-default-description');
	const noMatchActions =
		typeof noMatchContent !== 'string' && noMatchContent
			? noMatchContent
			: undefined;

	return (
		<>
			{bodyState === 'loading' ? (
				<div
					className="publy-table-card"
					data-row-height={resolvedRowHeight}
					data-slot="table-card"
					data-testid={`${testId}-loading`}
				>
					<div className="publy-table-skeleton-header" />
					{SKELETON_ROW_KEYS.map((rowKey) => (
						<div key={rowKey} className="publy-table-skeleton-row">
							<Skeleton className="size-[26px] shrink-0 rounded-full" />
							<Skeleton className="h-3 w-40 rounded-full" />
							<Skeleton className="h-3 w-56 rounded-full" />
							<Skeleton className="ml-auto h-5 w-16 rounded-full" />
							<Skeleton className="h-5 w-16 rounded-full" />
						</div>
					))}
				</div>
			) : null}

			{bodyState === 'error' ? (
				<ErrorStateSurface
					icon={errorIcon}
					title={errorTitle ?? t('list-unavailable-title')}
					description={errorDescription}
					actions={
						<>
							{errorActions}
							<Button variant="outline" onClick={onRetry} type="button">
								{t('retry')}
							</Button>
						</>
					}
					testId={`${testId}-error`}
				/>
			) : null}

			{bodyState === 'empty' ? (
				<StateSurface
					icon={emptyIcon}
					title={emptyTitle ?? t('list-empty-title')}
					description={emptyDescription}
					actions={emptyActions}
					testId={`${testId}-empty`}
				/>
			) : null}

			{bodyState === 'no-match' ? (
				<NoMatchStateSurface
					icon={noMatchIcon}
					title={noMatchTitle ?? t('list-no-match-title')}
					description={noMatchDescription}
					actions={noMatchActions}
					testId={`${testId}-no-match`}
				/>
			) : null}
		</>
	);
};
