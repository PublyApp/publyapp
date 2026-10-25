import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

type MarkerState = 'published' | 'failed' | 'pending';

const MARKER_LABEL_KEYS = {
	published: 'posts:history-segment-published',
	failed: 'posts:history-segment-failed',
	pending: 'posts:history-segment-pending',
} as const satisfies Record<MarkerState, string>;

const markerState = (
	number: number,
	published: number,
	failingNumber: number | null,
): MarkerState => {
	if (number <= published) {
		return 'published';
	}
	return number === failingNumber ? 'failed' : 'pending';
};

/** How far a thread publication got: "Published 2 of 5 segments" plus one
 * marker per segment, with the failing one highlighted. Renders nothing for a
 * plain single-segment post. */
export const PublicationSegmentProgress = ({
	status,
	published,
	total,
}: {
	status: string | null;
	published: number;
	total: number;
}) => {
	const { t } = useTranslation(['posts']);

	if (total <= 1) {
		return null;
	}

	const isStopped = status === 'failed' || status === 'paused';
	const isDone = status === 'published' || published >= total;
	const failingNumber = isStopped && !isDone ? published + 1 : null;
	const label = isDone
		? t('posts:history-segments-total', { total })
		: t('posts:history-segments-progress', {
				count: published,
				published,
				total,
			});

	return (
		<div
			className="flex flex-col items-start gap-1"
			data-testid="tenant-posts-history-segments"
		>
			<p className="publy-type-helper text-muted-foreground">{label}</p>
			<ol className="flex flex-wrap gap-1">
				{Array.from({ length: total }, (_, index) => {
					const number = index + 1;
					const state = markerState(number, published, failingNumber);
					const text = t(MARKER_LABEL_KEYS[state], { index: number });

					return (
						<li
							key={number}
							title={text}
							aria-label={text}
							data-state={state}
							data-testid="tenant-posts-history-segment"
							className={cn(
								'flex size-5 items-center justify-center rounded-[var(--publy-radius-chip)] text-[10px] font-medium',
								state === 'published' &&
									'bg-(--publy-surface-raised) text-foreground',
								state === 'failed' &&
									'border border-(--publy-danger) bg-(--publy-danger-soft) text-(--publy-danger)',
								state === 'pending' &&
									'border border-border text-muted-foreground',
							)}
						>
							{number}
						</li>
					);
				})}
			</ol>
		</div>
	);
};
