import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

import { LedgerRowHeader } from './ledger-row-header';

type FactEntry = {
	id: string;
	labelI18nKey: string;
	bodyI18nKey: string;
};

// Six true capabilities (PROMPT.md §4 Row 05): no counts, no percentages, no
// uptime, no "10x faster" — every fact cashes out into a real product noun
// from _context.md §1. 1–3 restate the three retained differentiators
// (single calendar, per-action permissions, draft→approval→publish trail,
// the page's former claim-card triple); 4–6 add calendar breadth, profile
// isolation and weekly dashboards.
const FACTS: readonly FactEntry[] = [
	{ id: 'plan', labelI18nKey: 'facts-1-label', bodyI18nKey: 'facts-1-body' },
	{
		id: 'teamwork',
		labelI18nKey: 'facts-2-label',
		bodyI18nKey: 'facts-2-body',
	},
	{
		id: 'traceability',
		labelI18nKey: 'facts-3-label',
		bodyI18nKey: 'facts-3-body',
	},
	{
		id: 'calendar',
		labelI18nKey: 'facts-4-label',
		bodyI18nKey: 'facts-4-body',
	},
	{
		id: 'isolation',
		labelI18nKey: 'facts-5-label',
		bodyI18nKey: 'facts-5-body',
	},
	{
		id: 'dashboards',
		labelI18nKey: 'facts-6-label',
		bodyI18nKey: 'facts-6-body',
	},
];

// Which cells earn a top rule at each breakpoint's column count (PROMPT.md
// §4 Row 05: "cells 4-6 at lg, cells 3-6 at md, every cell but the first
// below md"). row = floor(index / columns); bordered once row >= 1. The same
// formula holds at every breakpoint, so this is index math rather than
// hand-managed nth-child selectors.
const borderClassesFor = (index: number): string =>
	cn(
		index >= 1 && 'border-t border-(--publy-rule)',
		index === 1 && 'md:border-t-0',
		index === 2 && 'lg:border-t-0',
	);

/**
 * Row 05 — The capability strip (PROMPT.md §4 Row 05, `todesktop-31`).
 * Ground: raised. Six facts as "Label. Continuation." pairs sharing one line
 * box (`todesktop-05`'s metric parity — both 16/26, the label only adding
 * weight and one foreground rank, so there is no baseline drift), a 2px
 * decorative accent stub per cell, and two floating hairlines — shorter than
 * the cell block, so they read as hairlines rather than closing the grid
 * into boxes — rather than a `gap-px` vertical rule.
 *
 * Empty-slot reading: no slot. Six facts, high density, zero images.
 */
export const LedgerFacts = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');

	return (
		<div>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('facts-eyebrow')}
				title={t('facts-title')}
				titleContinuation={t('facts-title-continuation')}
				raised
			/>
			<div className="relative">
				<span
					aria-hidden="true"
					className="ld07-floating-hairline left-1/2 hidden md:block lg:hidden"
				/>
				<span
					aria-hidden="true"
					className="ld07-floating-hairline hidden left-1/3 lg:block"
				/>
				<span
					aria-hidden="true"
					className="ld07-floating-hairline hidden left-2/3 lg:block"
				/>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
					{FACTS.map((fact, index) => (
						<div
							key={fact.id}
							className={cn('flex gap-3 px-1 py-5', borderClassesFor(index))}
						>
							<span
								aria-hidden="true"
								className="ld07-accent-rule mt-1.5 h-4 w-0.5 shrink-0"
							/>
							<p className="max-w-[46ch]">
								<span className="ld07-body-label text-(--publy-foreground)">
									{t(fact.labelI18nKey)}
								</span>{' '}
								<span className="ld07-body text-(--publy-foreground-secondary)">
									{t(fact.bodyI18nKey)}
								</span>
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
