import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { LANDING_06_PRESS_CLASSES } from './landing-motion';

const TIERS = ['studio', 'agency', 'network'] as const;

// Documentation for the pricing slot's intended asset — never rendered (see
// MarketingImageSlot's doc comment). Held in a constant rather than inlined
// as the `subject` prop's literal so it reads as data, not JSX-attribute UI
// copy.
const PRICING_SLOT_SUBJECT = 'The billing screen, once billing exists';

/**
 * Pricing (PROMPT.md §10.3–§10.4): gated, not deleted. `_context.md` §2 is
 * explicit — "prices ship struck-through with a beta note. Do not remove
 * pricing; gate it." Each tier is the same concentric 14/4/10 frame the hero
 * and tour scenes use (`todesktop-22`/`-23`), ringed rather than shadowed —
 * the halving cascade stays reserved for exactly the hero and the closing
 * CTA (§1.6). The struck price uses `--publy-foreground-muted` (4.8:1), not
 * `-subtle` (2.6:1) — a struck price still has to be readable to do its job
 * (§10.3).
 */
export const LandingPricing = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div>
			<p className="publy-landing-06-eyebrow-mono">
				{t('landing-06-pricing-eyebrow')}
			</p>
			<h2 className="publy-landing-06-type-display-3 mt-3 max-w-[26ch] text-balance">
				{t('landing-06-pricing-title')}
			</h2>
			<p className="publy-landing-06-type-body mt-3 text-(--publy-foreground-secondary)">
				{t('landing-06-pricing-subtitle')}
			</p>
			{/* Mobile: one column, capped at a readable card width rather than
			    the literal desktop cell width (§14.3 — at 960px with a 20px
			    gutter the desktop cell is (960-40)/3=306px, which the prompt's
			    own worked example rejects as "too narrow to read on a phone";
			    400px is the readable value it settles on instead). */}
			<div className="mx-auto mt-10 grid max-w-[400px] grid-cols-1 gap-5 md:mx-0 md:max-w-none md:grid-cols-3">
				{TIERS.map((tier) => (
					<div key={tier} className="publy-landing-06-frame">
						<div className="publy-landing-06-frame-inner flex h-full flex-col gap-4 p-6">
							<div className="flex items-center justify-between gap-2">
								<p className="publy-landing-06-type-body-label">
									{t(`landing-06-pricing-${tier}-name`)}
								</p>
								{tier === 'agency' ? (
									<span className="publy-landing-06-type-small-label rounded-[var(--publy-radius-chip)] bg-(--publy-primary-soft) px-2 py-0.5 text-(--publy-primary-soft-foreground)">
										{t('landing-06-pricing-agency-badge')}
									</span>
								) : null}
							</div>
							<div>
								<p className="flex items-baseline gap-2">
									<span className="publy-landing-06-type-display-3 text-(--publy-foreground-muted) line-through decoration-2">
										{t(`landing-06-pricing-${tier}-price`)}
									</span>
									<span className="publy-landing-06-type-small text-(--publy-foreground-muted)">
										{t('landing-06-pricing-per-month')}
									</span>
								</p>
								<p className="publy-landing-06-type-small-label mt-1 text-(--publy-marketing-eyebrow-accent)">
									{t('landing-06-pricing-beta-note')}
								</p>
							</div>
							<p className="publy-landing-06-type-body text-(--publy-foreground-secondary)">
								{t(`landing-06-pricing-${tier}-description`)}
							</p>
							<Link
								to="/signup"
								className={cn(
									buttonVariants({
										variant: tier === 'agency' ? 'default' : 'outline',
										size: 'sm',
									}),
									'mt-auto no-underline',
									LANDING_06_PRESS_CLASSES,
								)}
							>
								{t(`landing-06-pricing-${tier}-cta`)}
							</Link>
						</div>
					</div>
				))}
			</div>
			{/* The whisper tint (§7.3): fully transparent, a struck-through price
			    table loses its floor here — 3%/4% of reserved mass terminates the
			    section without drawing a fake UI element. */}
			<div className="mx-auto mt-10 max-w-[420px]">
				<MarketingImageSlot
					slot="pricing-context"
					subject={PRICING_SLOT_SUBJECT}
					ratio="21 / 9"
					tint
					alt={t('landing-06-pricing-image-alt')}
					className="publy-landing-06-slot-21-9 publy-landing-06-slot-tier-d3"
				/>
			</div>
		</div>
	);
};
