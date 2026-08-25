import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { cn } from '~/lib/utils';

/**
 * §7 — pricing: the page's ONE raised tray, and the only place it is raised.
 *
 * This is todesktop-23's concentric frame, restored: a `--publy-surface-muted`
 * outer plate with the card inset exactly 4px inside it (14 − 4 = 10, an exact
 * token pair), the CTA standing on the plate below the card, and the featured
 * tier separated by ELEVATION ALONE (sendr-18) — no border, no colour, no
 * ribbon, so the CTA stays the loudest thing in the tray.
 *
 * A previous pass deleted these in the name of "the day draws with lines,
 * never with fills". They are the best object in the direction, and a
 * principle that deletes the best object on the page is the wrong principle.
 * The rule is now stated the way it should have been from the start: the page
 * has THREE kinds of surface — windows (the product), bands (the night), and
 * ONE raised tray. The tray is used exactly once, here, because this is the
 * one place on the page where the reader is asked to compare three things and
 * pick one. Scarcity is the whole meaning: the page raises a surface once, and
 * that is the moment it asks for a decision. See `landing.css`,
 * "THE THREE SURFACES".
 *
 * Two corrections from the ruled-cell pass are kept, because both were right
 * in either layout:
 *
 * 1. THE BADGE ROW IS RESERVED IN EVERY TRAY, filled in one. Rendering it only
 *    on the featured tier pushed that tier's name, price and CTA ~28px below
 *    its neighbours' — exactly where the eye is comparing rows across columns.
 *    A fixed-height BLOCK, not an inline spacer: an empty inline-level box
 *    takes its baseline from its bottom margin edge rather than from its
 *    content, so the featured tray still sat 7px off.
 * 2. THE CTA IS PUSHED TO THE FOOT BY FLEX, not by a 72px minimum measured
 *    against one locale. The grid stretches every tray to the tallest, the
 *    inner card takes the slack, and the description takes the slack inside
 *    it — so the three buttons sit on one line whatever a locale does to the
 *    copy above them.
 *
 * The price row is three registers, not one: the struck figure at display-3 in
 * the muted step (it is the thing being withdrawn), the unit at body in the
 * same muted step (it belongs to the figure), and the beta note at the label
 * weight in full foreground — because the note, not the price, is the true
 * statement in that row.
 */
const PRICING_TIERS = [
	{ id: 'studio', featured: false },
	{ id: 'agency', featured: true },
	{ id: 'network', featured: false },
] as const;

export const LandingPricing = () => {
	const { t } = useTranslation('landing');

	return (
		<div className="publy-landing-section-body grid gap-4 md:grid-cols-3">
			{PRICING_TIERS.map((tier) => (
				<article
					key={tier.id}
					data-testid={`landing-pricing-${tier.id}`}
					className={cn(
						'flex flex-col rounded-[var(--publy-radius-card)] bg-(--publy-surface-muted) p-1',
						tier.featured
							? 'publy-landing-shadow-panel'
							: 'shadow-[var(--publy-shadow-ring)]',
					)}
				>
					{/* 28, not 24 or 32, and it is derived rather than picked. Every
					    other object on this page insets its content 32px from the
					    section's own edge — that is where the hairline grids put
					    their cell copy, measured at 201 against a 169 heading. The
					    plate spends 4 of those 32 on the concentric frame, so the
					    card spends 28: 4 + 28 = 32, and the tier names land on the
					    same left edge as every other object's content. Same
					    arithmetic as the radius pair (14 − 4 = 10), applied to
					    padding. The foot below carries `px-7` for the same reason. */}
					<div className="flex flex-1 flex-col rounded-[var(--publy-radius-small-control)] bg-(--publy-surface) p-7">
						{/* The reserved row is reserved only where there is a row to
						    compare. Below `md` the trays stack, nothing sits beside
						    anything, and a 28px void at the top of two of three
						    trays is just a hole; `h-auto` collapses the empty block
						    to nothing there and the featured badge keeps its own
						    height. */}
						<div className="h-auto md:h-7">
							{tier.featured ? (
								<span className="publy-landing-ring-chip publy-type-sky-micro inline-flex h-7 items-center rounded-[var(--publy-radius-small-control)] px-2.5 text-(--publy-foreground-secondary)">
									{t('landing-pricing-agency-badge')}
								</span>
							) : null}
						</div>
						<h3 className="publy-type-sky-display-3 publy-landing-optical-flush mt-6 text-(--publy-foreground)">
							{t(`landing-pricing-${tier.id}-name`)}
						</h3>
						<div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<del className="publy-type-sky-display-3 publy-landing-tabular text-(--publy-foreground-muted)">
								{t(`landing-pricing-${tier.id}-price`)}
							</del>
							<span className="publy-type-sky-body text-(--publy-foreground-muted)">
								{t('landing-pricing-per-month')}
							</span>
							<span className="publy-type-sky-label text-(--publy-foreground)">
								{t('landing-pricing-beta-note')}
							</span>
						</div>
						<p className="publy-type-sky-body mt-6 max-w-[46ch] flex-1 text-pretty text-(--publy-foreground-secondary)">
							{t(`landing-pricing-${tier.id}-description`)}
						</p>
					</div>
					<div className="px-7 pt-6 pb-7">
						<Link
							to="/signup"
							className={cn(
								buttonVariants({ variant: 'default', size: 'lg' }),
								'publy-landing-pressable w-full',
							)}
						>
							{t(`landing-pricing-${tier.id}-cta`)}
						</Link>
					</div>
				</article>
			))}
		</div>
	);
};
