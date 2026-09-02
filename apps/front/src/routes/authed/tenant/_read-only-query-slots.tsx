/**
 * `QueryDisplay` migration helpers — the shared ErrorSlot/LoadingSlot pair
 * for the tenant read-only cards (issue #1250 PR 2).
 *
 * These slots reproduce, byte for byte, the copy and affordances each
 * migrated screen rendered with its hand-rolled ladder:
 * - the loading slot keeps the screen's own three-row skeleton (with its
 *   original testId) instead of QueryDisplay's default spinner;
 * - the error slot keeps the screen's `ErrorStateSurface` card (same i18n
 *   keys, same retry button wired to `query.refetch()`).
 *
 * The logout gate (`shouldLogoutForFailure`) stays in the page component,
 * exactly where it was: it must keep short-circuiting before any state is
 * painted.
 */
import { IconAlertCircle } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { ErrorStateSurface } from '~/components/ui/state-surface';

export const TenantReadOnlyCardSkeleton = ({
	testId,
	rows = 3,
}: {
	testId?: string;
	rows?: number;
}) => (
	<div className="space-y-4" data-testid={testId}>
		{Array.from({ length: rows }, (_, index) => (
			<Skeleton key={`skeleton-${index}`} className="h-9 w-full" />
		))}
	</div>
);

export const TenantReadOnlyCardError = <TData, TError = Error>({
	query,
	onRetry,
	titleKey,
	descriptionKey,
	testId,
}: {
	titleKey: string;
	descriptionKey: string;
	testId?: string;
} & (
	| {
			query: Pick<UseQueryResult<TData, TError>, 'refetch'>;
			onRetry?: never;
	  }
	| {
			query?: never;
			onRetry: () => void | Promise<void>;
	  }
)) => {
	const { t } = useTranslation(['common']);
	const retry = onRetry ?? (() => query.refetch());

	return (
		<ErrorStateSurface
			icon={IconAlertCircle}
			title={t(titleKey)}
			description={t(descriptionKey)}
			testId={testId}
			actions={
				<Button variant="default" type="button" onClick={() => void retry()}>
					{t('common:retry')}
				</Button>
			}
		/>
	);
};

/**
 * The error branch of these screens wraps the surface in the same Card
 * chrome as the data branch. This slot renders that wrapper + surface.
 */
export const TenantReadOnlyCardErrorInCard = <TData, TError = Error>({
	query,
	cardTitleKey,
	titleKey,
	descriptionKey,
	testId,
}: {
	query: Pick<UseQueryResult<TData, TError>, 'refetch'>;
	cardTitleKey: string;
	titleKey: string;
	descriptionKey: string;
	testId?: string;
}) => {
	const { t } = useTranslation(['common']);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t(cardTitleKey)}</CardTitle>
			</CardHeader>
			<CardContent>
				<TenantReadOnlyCardError
					query={query}
					titleKey={titleKey}
					descriptionKey={descriptionKey}
					testId={testId}
				/>
			</CardContent>
		</Card>
	);
};
