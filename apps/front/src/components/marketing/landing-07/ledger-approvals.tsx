import { useTranslation } from 'react-i18next';

/**
 * Row 07 — Approvals (PROMPT.md §4 Row 07, `padyna-20`). A two-column text
 * band with no visual. `sm:items-end` is the whole trick: bottom-aligned
 * columns read as composed even when the two blocks carry different line
 * counts, where top-alignment would read as a broken grid.
 *
 * Approvals and per-action permissions are the differentiator that is least
 * screenshot-able, which is exactly why this row carries no image slot — a
 * free, honest section for a page with empty slots.
 *
 * Empty-slot reading: no slot, 100%.
 */
export const LedgerApprovals = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-12">
			<div className="flex flex-1 flex-col gap-3">
				<div className="flex items-baseline gap-3">
					<span
						aria-hidden="true"
						className="ld07-row-number text-(--publy-foreground-subtle)"
					>
						{rowNumber}
					</span>
					<span className="publy-type-eyebrow text-(--publy-foreground-muted)">
						{t('approvals-eyebrow')}
					</span>
				</div>
				<h2 className="ld07-display-2 max-w-[18ch] text-balance">
					<span className="text-(--publy-foreground)">
						{t('approvals-title')}
					</span>{' '}
					<span className="text-(--publy-foreground-muted)">
						{t('approvals-title-continuation')}
					</span>
				</h2>
			</div>
			<p className="ld07-body max-w-[52ch] flex-1 text-(--publy-foreground-secondary)">
				{t('approvals-body')}
			</p>
		</div>
	);
};
