import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

/**
 * §7 — pricing, drawn the way the rest of the day is drawn.
 *
 * NO TRAYS. Round one built each tier as todesktop-23's concentric frame: a
 * `--publy-surface-muted` outer plate with a white card inset 4px inside it,
 * and a shadow cascade on the featured one. That is a beautiful object and it
 * was the wrong object here — three grey trays sitting in the middle of a
 * document that draws everything else with 1px lines. It also gave the page a
 * THIRD kind of surface (window, band, tray) when the direction only ever had
 * room for two.
 *
 * The three tiers are now three cells of the same hairline grid that carries
 * "who it is for" and the planned trial: no fill, no radius, no shadow, one
 * shared rule between them.
 *
 * THE FEATURED TIER IS MARKED BY ITS BADGE AND BY NOTHING ELSE. Elevation was
 * the old differentiator (sendr-18) and elevation has no meaning on a surface
 * that is not raised. A ribbon or a colour would be worse: these are
 * placeholder prices, struck through, on a product that cannot yet charge
 * anyone, and shouting about the middle one would be the page's only piece of
 * salesmanship. THE BADGE ROW IS STILL RESERVED IN EVERY CELL, filled in one —
 * without it the Agency tier's name, price and CTA sat ~28px below its
 * neighbours', which is exactly where the eye is comparing rows across
 * columns.
 *
 * The price row is three registers, not one: the struck figure at display-3
 * in the muted step (it is the thing being withdrawn), the unit at body in
 * the same muted step (it belongs to the figure), and the beta note at the
 * label weight in full foreground — because the note, not the price, is the
 * true statement in that row.
 */
const PRICING_TIERS = [
	{ id: 'studio', featured: false },
	{ id: 'agency', featured: true },
	{ id: 'network', featured: false },
] as const;

export const Landing05APricing = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="publy-marketing-hairline-grid publy-l05a-section-body grid md:grid-cols-3">
			{PRICING_TIERS.map((tier) => (
				<article
					key={tier.id}
					data-testid={`landing-pricing-${tier.id}`}
					className="flex flex-col p-8"
				>
					{/* A BLOCK of the badge's exact height, in every cell. An
					    inline spacer is not enough: an empty inline-level box
					    takes its baseline from its bottom margin edge rather than
					    from its content, so the featured cell still sat 7px off
					    its neighbours. A fixed-height block has no baseline to
					    disagree about. */}
					<div className="h-7">
						{tier.featured ? (
							<span className="publy-l05a-ring-chip publy-type-sky-micro inline-flex h-7 items-center rounded-[var(--publy-radius-small-control)] px-2.5 text-(--publy-foreground-secondary)">
								{t('landing-pricing-agency-badge')}
							</span>
						) : null}
					</div>
					<h3 className="publy-type-sky-display-3 publy-l05a-optical-flush mt-6 text-(--publy-foreground)">
						{t(`landing-pricing-${tier.id}-name`)}
					</h3>
					<div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<del className="publy-type-sky-display-3 publy-l05a-tabular text-(--publy-foreground-muted)">
							{t(`landing-pricing-${tier.id}-price`)}
						</del>
						<span className="publy-type-sky-body text-(--publy-foreground-muted)">
							{t('landing-pricing-per-month')}
						</span>
						<span className="publy-type-sky-label text-(--publy-foreground)">
							{t('landing-pricing-beta-note')}
						</span>
					</div>
					{/* `flex-1` on the description rather than a `min-height`: the
					    CTA is pushed to the foot of the cell, and the grid
					    stretches every cell to the tallest, so the three buttons
					    sit on one line whatever a locale does to the copy above
					    them. The old 72px minimum was measured against `en`. */}
					<p className="publy-type-sky-body mt-6 max-w-[46ch] flex-1 text-pretty text-(--publy-foreground-secondary)">
						{t(`landing-pricing-${tier.id}-description`)}
					</p>
					<Link
						to="/signup"
						className={cn(
							buttonVariants({ variant: 'default', size: 'lg' }),
							'publy-l05a-pressable mt-8 w-full',
						)}
					>
						{t(`landing-pricing-${tier.id}-cta`)}
					</Link>
				</article>
			))}
		</div>
	);
};
