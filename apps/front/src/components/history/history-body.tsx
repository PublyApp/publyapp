import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorKindState } from '~/components/error-views/error-kind-state';
import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import {
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';

import { HistoryFeed } from './history-feed';
import { HistorySkeleton } from './history-skeleton';
import type { HistoryEvent } from './history-types';

/**
 * The shared history's body: the loading skeleton, the error, the empty and
 * no-match surfaces, or the day-grouped feed with its retention footnote and
 * pager. Split out of `HistoryPage` so the page stays under the
 * `react-doctor/no-giant-component` size bound, and the state ladder lives in
 * `QueryDisplay` instead of an `if` chain.
 */
export const HistoryBody = ({
	testId,
	events,
	locale,
	showOrganisation,
	onOpen,
	openLabel,
	emptyTitle,
	emptyText,
	noMatchTitle,
	noMatchText,
	hasActiveFilters,
	footnote,
	pager,
	query,
}: {
	testId: string;
	events: readonly HistoryEvent[];
	locale: string;
	showOrganisation: boolean;
	onOpen: (event: HistoryEvent) => void;
	openLabel: (event: HistoryEvent) => string;
	emptyTitle: string;
	emptyText: string;
	noMatchTitle?: string;
	noMatchText?: string;
	hasActiveFilters: boolean;
	/** The exact whole-collection summary, or the « — » unknown variant. */
	footnote: string;
	pager?: ReactNode;
	query: QueryDisplayQuery<unknown>;
}) => {
	const { t } = useTranslation('common');

	const emptyNode = hasActiveFilters ? (
		<NoMatchStateSurface
			title={noMatchTitle ?? t('list-no-match-title')}
			description={noMatchText ?? t('list-no-match-default-description')}
			testId={`${testId}-no-match`}
		/>
	) : (
		<StateSurface
			title={emptyTitle}
			description={emptyText}
			testId={`${testId}-empty`}
		/>
	);
	// `QueryDisplay` reads emptiness from `data`; the API returns a page object
	// (never an empty array), so hand it the event list — the same predicate the
	// hand-written ladder used.
	const stateQuery: QueryDisplayQuery = { ...query, data: events };

	return (
		<QueryDisplay
			query={stateQuery}
			LoadingSlot={<HistorySkeleton testId={testId} />}
			ErrorSlot={
				<ErrorKindState
					scale="inline"
					panel
					error={query.error}
					onRetry={() => void query.refetch()}
					testId={`${testId}-error`}
				/>
			}
			EmptySlot={emptyNode}
		>
			{() => (
				<>
					<HistoryFeed
						testId={testId}
						events={events}
						locale={locale}
						showOrganisation={showOrganisation}
						onOpen={onOpen}
						openLabel={openLabel}
					/>
					<p
						className="py-2 text-center text-xs text-muted-foreground"
						data-testid={`${testId}-count`}
					>
						{footnote}
					</p>
					{pager}
				</>
			)}
		</QueryDisplay>
	);
};
