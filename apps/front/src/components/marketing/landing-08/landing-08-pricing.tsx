import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

type PricingTier = {
	id: 'studio' | 'agency' | 'network';
	nameKey: string;
	priceKey: string;
	descriptionKey: string;
	ctaKey: string;
	badgeKey?: string;
};

const PRICING_TIERS: readonly PricingTier[] = [
	{
		id: 'studio',
		nameKey: 'landing-pricing-studio-name',
		priceKey: 'landing-pricing-studio-price',
		descriptionKey: 'landing-pricing-studio-description',
		ctaKey: 'landing-pricing-studio-cta',
	},
	{
		id: 'agency',
		nameKey: 'landing-pricing-agency-name',
		priceKey: 'landing-pricing-agency-price',
		descriptionKey: 'landing-pricing-agency-description',
		ctaKey: 'landing-pricing-agency-cta',
		badgeKey: 'landing-pricing-agency-badge',
	},
	{
		id: 'network',
		nameKey: 'landing-pricing-network-name',
		priceKey: 'landing-pricing-network-price',
		descriptionKey: 'landing-pricing-network-description',
		ctaKey: 'landing-pricing-network-cta',
	},
];

/**
 * The price ledger — three ruled rows, no cards. A card promotes its
 * content, and placeholder pricing must not be promoted (the same reasoning
 * the FAQ's bare hairline rests on). Every price is struck through and
 * carries the beta note in the same breath, so the row never reads as live
 * billing.
 */
export const Landing08Pricing = () => {
	const { t } = useTranslation('landing-08');

	return (
		<div className="mt-12 flex flex-col">
			{PRICING_TIERS.map((tier) => (
				<div
					key={tier.id}
					data-testid={`landing-pricing-${tier.id}`}
					className="border-t border-(--publy-border) pt-8 lg:grid lg:grid-cols-12 lg:items-baseline lg:gap-6"
				>
					<div className="flex items-center gap-2 lg:col-span-3">
						<p className="publy-type-copy-mark">{t(tier.nameKey)}</p>
						{tier.badgeKey === undefined ? null : (
							<span className="publy-type-mono text-(--publy-foreground-muted)">
								{t(tier.badgeKey)}
							</span>
						)}
					</div>
					<div className="mt-3 lg:col-span-3 lg:mt-0">
						<div className="flex items-baseline gap-2">
							<del className="publy-type-title text-(--publy-foreground-muted)">
								{t(tier.priceKey)}
							</del>
							<span className="publy-type-marginal">
								{t('landing-pricing-per-month')}
							</span>
						</div>
						<p className="publy-type-mono mt-1">
							{t('landing-pricing-beta-note')}
						</p>
					</div>
					<p className="publy-type-copy mt-3 lg:col-span-4 lg:mt-0">
						{t(tier.descriptionKey)}
					</p>
					<div className="mt-4 lg:col-span-2 lg:mt-0 lg:justify-self-end">
						<Link
							to="/signup"
							className={cn(
								buttonVariants({ variant: 'outline', size: 'sm' }),
								'no-underline',
							)}
						>
							{t(tier.ctaKey)}
						</Link>
					</div>
				</div>
			))}
		</div>
	);
};
