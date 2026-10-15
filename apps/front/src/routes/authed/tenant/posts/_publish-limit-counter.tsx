import { useTranslation } from 'react-i18next';
import type { TightestLimit } from '~/lib/text-counter/text-counter';
import { cn } from '~/lib/utils';

/** Live "123 / 300" counter for the tightest selected destination (issue
 * #2169). Warns from 90 percent, errors above the limit and names why. */
export const PublishLimitCounter = ({
	tightest,
}: {
	tightest: TightestLimit | null;
}) => {
	const { t } = useTranslation(['posts']);

	if (!tightest) {
		return null;
	}

	const unit =
		tightest.unit === 'bytes' ? ` ${t('posts:limit-unit-bytes')}` : '';

	return (
		<div data-testid="tenant-posts-limit-counter" data-state={tightest.state}>
			<p
				className={cn(
					'text-xs',
					tightest.state === 'ok' && 'text-muted-foreground',
					tightest.state === 'warning' && 'text-[var(--publy-warning)]',
					tightest.state === 'error' && 'text-[var(--publy-danger)]',
				)}
			>
				{tightest.actual} / {tightest.limit}
				{unit} · {tightest.destination}
			</p>
			{tightest.state === 'error' ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-limit-error"
				>
					{t('posts:limit-over', {
						destination: tightest.destination,
						actual: tightest.actual,
						limit: tightest.limit,
						unit: t(`posts:limit-unit-${tightest.unit}`),
					})}
				</p>
			) : null}
		</div>
	);
};
