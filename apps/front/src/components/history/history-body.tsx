import { IconAlertCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	ErrorStateSurface,
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
 * `react-doctor/no-giant-component` size bound, and the state ladder stays an
 * `if` chain instead of a nested ternary.
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
	errorText,
	pager,
	queryState,
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
	errorText?: string;
	pager?: ReactNode;
	queryState: { isPending: boolean; isError: boolean; onRetry: () => void };
}) => {
	const { t } = useTranslation('common');

	if (queryState.isPending) {
		return <HistorySkeleton testId={testId} />;
	}

	if (queryState.isError) {
		return (
			<ErrorStateSurface
				icon={IconAlertCircle}
				title={t('list-unavailable-title')}
				description={errorText ?? t('list-error-default-description')}
				actions={
					<Button variant="outline" onClick={queryState.onRetry} type="button">
						{t('retry')}
					</Button>
				}
				testId={`${testId}-error`}
			/>
		);
	}

	if (events.length === 0) {
		if (hasActiveFilters) {
			return (
				<NoMatchStateSurface
					title={noMatchTitle ?? t('list-no-match-title')}
					description={noMatchText ?? t('list-no-match-default-description')}
					testId={`${testId}-no-match`}
				/>
			);
		}

		return (
			<StateSurface
				title={emptyTitle}
				description={emptyText}
				testId={`${testId}-empty`}
			/>
		);
	}

	return (
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
	);
};
