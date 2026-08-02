import { cn } from '~/lib/utils';

export type LedgerRowHeaderProps = {
	/** Computed row number, e.g. "04" — pass `row.number` from LEDGER_ROWS. */
	number: string;
	eyebrow: string;
	title: string;
	/** The muted second span of a two-tone `<h2>` (§2.2 attio-30). */
	titleContinuation?: string;
	lede?: string;
	/**
	 * Row 10's subtitle is 14/22, not the row lede's 18/28 (§4 Row 10:
	 * "landing-pricing-subtitle … is the row lede, at 14/22"). Defaults to
	 * the standard lede size used everywhere else.
	 */
	ledeSize?: 'lede' | 'small';
	/**
	 * True on rows sitting on --publy-surface-raised (§2.3): steps the
	 * eyebrow up one foreground rank so its 11px mono label clears 4.5:1 on
	 * the raised background instead of staying at the borderline
	 * --publy-foreground-muted, which only clears it on the plain page
	 * ground.
	 */
	raised?: boolean;
	className?: string;
};

/**
 * The row-header triple (§3.5): row number + eyebrow on one shared baseline,
 * a two-tone `<h2>`, and a lede.
 */
export const LedgerRowHeader = ({
	number,
	eyebrow,
	title,
	titleContinuation,
	lede,
	ledeSize = 'lede',
	raised = false,
	className,
}: LedgerRowHeaderProps) => (
	<header className={cn('mb-10 flex flex-col gap-3 md:mb-14', className)}>
		<div className="flex items-baseline gap-3">
			<span
				aria-hidden="true"
				className="ld07-row-number text-(--publy-foreground-subtle)"
			>
				{number}
			</span>
			<span
				className={cn(
					'publy-type-eyebrow',
					raised
						? 'text-(--publy-foreground-secondary)'
						: 'text-(--publy-foreground-muted)',
				)}
			>
				{eyebrow}
			</span>
		</div>
		<h2 className="ld07-display-2 max-w-[22ch] text-balance">
			<span className="text-(--publy-foreground)">{title}</span>
			{titleContinuation ? (
				<>
					{' '}
					<span className="text-(--publy-foreground-muted)">
						{titleContinuation}
					</span>
				</>
			) : null}
		</h2>
		{lede ? (
			<p
				className={cn(
					'max-w-[52ch] text-pretty text-(--publy-foreground-muted)',
					ledeSize === 'small' ? 'ld07-body-small' : 'ld07-lede',
				)}
			>
				{lede}
			</p>
		) : null}
	</header>
);
