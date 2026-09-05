/**
 * `QueryDisplay` migration helpers — the shared ErrorSlot/LoadingSlot pair
 * for the tenant read-only cards (issue #1250 PR 2).
 *
 * These slots preserve the migrated screens' loading chrome and error-surface
 * structure while intentionally allowing the shared resolver to improve the
 * error copy and retry affordance when a real failure is available:
 * - the loading slot keeps the screen's own three-row skeleton (with its
 *   original testId) instead of QueryDisplay's default spinner;
 * - the error slot keeps the screen's `ErrorStateSurface` card and wires retry
 *   to `query.refetch()`, while status-specific detail can replace the old
 *   generic copy and non-retryable failures can hide the button.
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
import { resolveQueryError } from '~/lib/server/query-error-resolver';

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
	error,
	testId,
}: {
	titleKey: string;
	descriptionKey: string;
	/**
	 * The actual failure (when known). Issue #2043: the previous version had
	 * no `error` prop at all, so the card could not distinguish a 404
	 * (`supportsRetry: false` — no retry will ever resurrect a missing thing)
	 * from a 500 (`supportsRetry: true`). The resolver also paints a status-
	 * specific title/description so the user sees the real cause rather than
	 * the same generic sentence for every failure. Omit it to keep the legacy
	 * "titleKey + Retry" affordance.
	 */
	error?: unknown;
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

	if (error !== undefined) {
		const resolved = resolveQueryError(error, t);
		return (
			<ErrorStateSurface
				icon={IconAlertCircle}
				eyebrow={resolved.code}
				title={resolved.title}
				description={resolved.description}
				testId={testId}
				actions={
					resolved.supportsRetry ? (
						<Button
							variant="default"
							type="button"
							onClick={() => void retry()}
						>
							{t('common:retry')}
						</Button>
					) : undefined
				}
			/>
		);
	}

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
	error,
	testId,
}: {
	query: Pick<UseQueryResult<TData, TError>, 'refetch'>;
	cardTitleKey: string;
	titleKey: string;
	descriptionKey: string;
	error?: unknown;
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
					error={error}
					testId={testId}
				/>
			</CardContent>
		</Card>
	);
};
