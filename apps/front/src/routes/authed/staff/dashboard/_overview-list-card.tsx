import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { buttonVariants } from '~/components/ui/button.variants';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StatusPill } from '~/components/ui/product-page';
import { StateSurface } from '~/components/ui/state-surface';
import { statusPillTone } from '~/components/ui/status-tone';

/** Lifecycle status → the existing `status-*` label key in `common`; anything
 * else falls back to the backend's own string (the data, not a guess). */
const STATUS_LABEL_KEYS = {
	active: 'status-active',
	pending: 'status-pending',
	suspended: 'status-suspended',
	globallysuspended: 'status-globally-suspended',
	globally_suspended: 'status-globally-suspended',
} as const;

export const StatusLabel = ({
	status,
	t,
}: {
	status: string | null;
	t: (key: string) => string;
}) => {
	const normalized = status?.trim().toLowerCase() ?? '';
	if (!normalized) {
		return null;
	}

	const labelKey =
		STATUS_LABEL_KEYS[normalized as keyof typeof STATUS_LABEL_KEYS];

	return (
		<StatusPill tone={statusPillTone(status)}>
			{labelKey ? t(labelKey) : status}
		</StatusPill>
	);
};

/**
 * One summary card: title + "view all" link, then QueryDisplay-driven
 * loading/error/empty/content states over the passed rows. All copy comes
 * from `t`; no fabricated numbers or rows.
 */
export const OverviewListCard = ({
	title,
	viewAllTo,
	testId,
	isPending,
	error,
	onRetry,
	rows,
	emptyTitle,
	renderRows,
	t,
}: {
	title: string;
	viewAllTo: string;
	testId: string;
	isPending: boolean;
	error: Error | null;
	onRetry: () => void;
	rows: unknown[];
	emptyTitle: string;
	renderRows: () => ReactNode;
	t: (key: string) => string;
}) => {
	let body: ReactNode;
	if (isPending) {
		body = (
			<div className="space-y-3" data-testid={`${testId}-loading`}>
				<div className="h-4 w-2/5 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
				<div className="h-4 w-1/3 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
			</div>
		);
	} else if (error) {
		body = (
			<StateSurface
				tone="danger"
				title={t('overview-error-title')}
				actions={
					<button
						type="button"
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
						onClick={onRetry}
					>
						{t('retry')}
					</button>
				}
				testId={`${testId}-error`}
			/>
		);
	} else if (rows.length === 0) {
		body = <StateSurface title={emptyTitle} testId={`${testId}-empty`} />;
	} else {
		body = renderRows();
	}

	return (
		<Card data-testid={testId}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<Link
					to={viewAllTo}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					{t('view-all')}
					<IconArrowRight aria-hidden="true" className="size-4" />
				</Link>
			</CardHeader>
			<CardContent>{body}</CardContent>
		</Card>
	);
};
