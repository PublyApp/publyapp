import { cn } from '~/lib/utils';

export type LedgerRowHeaderProps = {
	/** Computed row number, e.g. "04" — pass `row.number` from LEDGER_ROWS. */
	number: string;
	eyebrow: string;
	title: string;
	/** The muted second span of a two-tone `<h2>` (§2.2 attio-30). */
	titleContinuation?: string;
	lede?: string;
	className?: string;
};

/**
 * The row-header triple (§3.5): row number + eyebrow on one shared baseline,
 * a two-tone `<h2>`, and a lede. Built now as shared scaffolding for tasks
 * 2/3 — this component renders no copy of its own and is not yet mounted
 * inside any row (§ task brief: "no section content yet").
 */
export const LedgerRowHeader = ({
	number,
	eyebrow,
	title,
	titleContinuation,
	lede,
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
			<span className="publy-type-eyebrow text-(--publy-foreground-muted)">
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
			<p className="ld07-lede max-w-[52ch] text-pretty text-(--publy-foreground-muted)">
				{lede}
			</p>
		) : null}
	</header>
);
