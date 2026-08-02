import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

const LEDGER_ROW_SLUGS = [
	'hero',
	'index',
	'statement',
	'tour',
	'facts',
	'who-for',
	'approvals',
	'chain',
	'trial',
	'pricing',
	'faq',
	'closing',
] as const;

export type LedgerRowSlug = (typeof LEDGER_ROW_SLUGS)[number];

// Ground alternation (PROMPT.md §3.4): rows 02, 05, 08, 11 sit on
// --publy-surface-raised — a 3-row cadence so the eye picks up the pattern
// without being able to predict it as plain stripes.
const RAISED_ROW_POSITIONS = new Set([2, 5, 8, 11]);

export type LedgerRowCensusEntry = {
	slug: LedgerRowSlug;
	/** Computed with padStart, never a literal (§3.5) — e.g. "04". */
	number: string;
	raised: boolean;
};

/**
 * The twelve-row census (§4), in document order. The single source of truth
 * for row numbering: reordering a row here reorders its number everywhere,
 * including every in-page anchor (`#row-04`) that targets it.
 */
export const LEDGER_ROWS: readonly LedgerRowCensusEntry[] =
	LEDGER_ROW_SLUGS.map((slug, index) => {
		const position = index + 1;
		return {
			slug,
			number: String(position).padStart(2, '0'),
			raised: RAISED_ROW_POSITIONS.has(position),
		};
	});

export type LedgerRowProps = {
	row: LedgerRowCensusEntry;
	children?: ReactNode;
	className?: string;
};

/**
 * The section wrapper every numbered row shares (§3.1, §3.4): a
 * `border-b`-seamed `<section>` at the ledger's own inset. `ld07-row` in
 * landing-07.css carries the asymmetric padding rhythm, the ground
 * alternation and the row's scroll-margin; this component only owns the
 * id/testid/data attributes a row is addressed by.
 */
export const LedgerRow = ({ row, children, className }: LedgerRowProps) => (
	<section
		id={`row-${row.number}`}
		data-testid={`landing-07-row-${row.number}`}
		data-row={row.number}
		className={cn('ld07-row', row.raised && 'ld07-row-raised', className)}
	>
		<div className="px-4 sm:px-6 lg:px-8">{children}</div>
	</section>
);
