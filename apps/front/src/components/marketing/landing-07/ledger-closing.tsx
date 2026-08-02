import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { TickRuler } from './tick-ruler';
import { useLedgerReveal } from './use-ledger-reveal';

/**
 * Row 12 — The close (PROMPT.md §4 Row 12). The tick ruler's second and last
 * appearance, then a full-width solid `--publy-primary` panel — the one
 * thing this page has been holding back, inset from the ledger frame by the
 * row's own gutter. Buttons invert on the yellow: a yellow button on a
 * yellow panel is invisible, so the brown foreground carries the contrast
 * instead. Text ranks use `--publy-primary-foreground-muted` /
 * `-subtle` (landing-07.css) rather than a raw alpha modifier on the token.
 *
 * Empty-slot reading: no slot. A reserved empty field inside a solid yellow
 * band would be a visible hole, which is exactly the failure mode the
 * override protects against.
 */
export const LedgerClosing = () => {
	const { t } = useTranslation('landing-07');
	const reveal = useLedgerReveal<HTMLDivElement>(0);

	return (
		<div>
			<TickRuler />
			<div
				{...reveal}
				className="ld07-closing-panel bg-(--publy-primary) px-6 py-12 md:px-10 md:py-16 xl:px-14 xl:py-20"
			>
				<div className="flex flex-col gap-5">
					{/* -muted, not -subtle: this 11px mono label is real, painted
					    text needing the 4.5:1 small-text floor. -subtle (the
					    original spec's ~70% mix) only clears ~3.1:1 in light —
					    verified in .dump/report-t4.md — so it's reserved for the
					    secondary CTA's border below, a non-text use needing only
					    3:1. */}
					<span className="publy-type-eyebrow text-(--publy-primary-foreground-muted)">
						{t('closing-eyebrow')}
					</span>
					<h2 className="ld07-display-2 max-w-[20ch] text-balance">
						<span className="text-(--publy-primary-foreground)">
							{t('closing-title')}
						</span>{' '}
						<span className="text-(--publy-primary-foreground-muted)">
							{t('closing-title-continuation')}
						</span>
					</h2>
					<p className="ld07-body max-w-[56ch] text-(--publy-primary-foreground-muted)">
						{t('closing-description')}
					</p>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<Link
							to="/signup"
							className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] bg-(--publy-primary-foreground) px-5 text-[15px]/[20px] font-semibold tracking-(--publy-tracking-text) text-(--publy-primary) no-underline transition-transform duration-200 ease-(--publy-motion-ease) active:translate-y-px active:duration-50"
						>
							{t('closing-primary-cta')}
						</Link>
						<a
							href="#row-04"
							className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] border border-(--publy-primary-foreground-subtle) bg-transparent px-5 text-[15px]/[20px] font-semibold tracking-(--publy-tracking-text) text-(--publy-primary-foreground) no-underline transition-transform duration-200 ease-(--publy-motion-ease) active:translate-y-px active:duration-50"
						>
							{t('closing-secondary-cta')}
						</a>
					</div>
				</div>
			</div>
		</div>
	);
};
