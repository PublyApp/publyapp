import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

/**
 * §7 — pricing (todesktop-23's 4px-inset concentric frame: 14 − 4 = 10). The
 * Agency tier's featured state is elevation only (sendr-18) — no border, no
 * colour, no ribbon — so the CTA stays the loudest thing in the card.
 * Prices ship struck through with a beta note beside them; there is no
 * billing system and no monthly/yearly toggle, because there is nothing to
 * toggle.
 */
const PRICING_TIERS = [
	{ id: 'studio', featured: false },
	{ id: 'agency', featured: true },
	{ id: 'network', featured: false },
] as const;

export const Landing05APricing = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="publy-l05a-section-body grid gap-4 md:grid-cols-3">
			{PRICING_TIERS.map((tier) => (
				<article
					key={tier.id}
					data-testid={`landing-pricing-${tier.id}`}
					className={cn(
						'rounded-[var(--publy-radius-card)] bg-(--publy-surface-muted) p-1',
						tier.featured
							? 'publy-l05a-shadow-panel'
							: 'shadow-[var(--publy-shadow-ring)]',
					)}
				>
					<div className="rounded-[var(--publy-radius-small-control)] bg-(--publy-surface) p-6">
						{tier.id === 'agency' ? (
							<span className="rounded-[var(--publy-radius-small-control)] border border-(--publy-border) px-2.5 py-1 text-xs font-semibold text-(--publy-foreground-secondary)">
								{t('landing-pricing-agency-badge')}
							</span>
						) : null}
						<h3 className="publy-type-sky-display-3 mt-4 text-(--publy-foreground)">
							{t(`landing-pricing-${tier.id}-name`)}
						</h3>
						<div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<del className="publy-type-sky-display-3 publy-l05a-tabular text-(--publy-foreground-muted)">
								{t(`landing-pricing-${tier.id}-price`)}
							</del>
							<span className="publy-type-sky-body text-(--publy-foreground-secondary)">
								{t('landing-pricing-per-month')}
							</span>
							<span className="publy-type-sky-body text-(--publy-foreground-secondary)">
								{t('landing-pricing-beta-note')}
							</span>
						</div>
						<p className="publy-type-sky-body mt-4 min-h-[72px] max-w-[46ch] text-(--publy-foreground-secondary)">
							{t(`landing-pricing-${tier.id}-description`)}
						</p>
					</div>
					<div className="px-6 pt-6 pb-6">
						<Link
							to="/signup"
							className={cn(
								buttonVariants({ variant: 'default', size: 'lg' }),
								'publy-l05a-pressable w-full',
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
