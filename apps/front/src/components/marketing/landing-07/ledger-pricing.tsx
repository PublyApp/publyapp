import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { LedgerRowHeader } from './ledger-row-header';

type PricingTier = {
	id: 'studio' | 'agency' | 'network';
	nameI18nKey: string;
	priceI18nKey: string;
	descriptionI18nKey: string;
	ctaI18nKey: string;
	badge: boolean;
};

const PRICING_TIERS: readonly PricingTier[] = [
	{
		id: 'studio',
		nameI18nKey: 'pricing-studio-name',
		priceI18nKey: 'pricing-studio-price',
		descriptionI18nKey: 'pricing-studio-description',
		ctaI18nKey: 'pricing-studio-cta',
		badge: false,
	},
	{
		id: 'agency',
		nameI18nKey: 'pricing-agency-name',
		priceI18nKey: 'pricing-agency-price',
		descriptionI18nKey: 'pricing-agency-description',
		ctaI18nKey: 'pricing-agency-cta',
		badge: true,
	},
	{
		id: 'network',
		nameI18nKey: 'pricing-network-name',
		priceI18nKey: 'pricing-network-price',
		descriptionI18nKey: 'pricing-network-description',
		ctaI18nKey: 'pricing-network-cta',
		badge: false,
	},
];

/**
 * Row 10 — Pricing (PROMPT.md §4 Row 10). Three tiers as three cells of one
 * table rather than a floated card set (`padyna-21`'s shell-and-inner-card
 * construction rejected — "there is nothing to sell"): a price list with the
 * prices switched off. Every price is struck (`<s>`) with a visually-hidden
 * explanation, and the beta note sits beside it in all three tiers.
 *
 * Claim gating: prices stay visible and struck-through, never removed. The
 * beta note and the "Placeholder pricing" lede must both stay visible — that
 * lede is the row's honesty line.
 *
 * Empty-slot reading: no slot.
 */
export const LedgerPricing = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');

	return (
		<div>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('pricing-eyebrow')}
				title={t('pricing-title')}
				titleContinuation={t('pricing-title-continuation')}
				lede={t('pricing-subtitle')}
				ledeSize="small"
			/>
			<div className="grid grid-cols-1 gap-px bg-(--publy-rule) lg:grid-cols-3">
				{PRICING_TIERS.map((tier) => (
					<div
						key={tier.id}
						className="flex flex-col gap-4 bg-(--publy-background) p-6 md:p-8"
					>
						<div className="flex items-center justify-between gap-3">
							<h3 className="ld07-display-3">{t(tier.nameI18nKey)}</h3>
							{tier.badge ? (
								<span className="inline-flex h-6 items-center rounded-[var(--publy-radius-chip)] bg-(--publy-primary-soft) px-2 text-[11px]/[16px] font-semibold text-(--publy-primary-soft-foreground)">
									{t('pricing-agency-badge')}
								</span>
							) : null}
						</div>
						<p className="flex items-baseline gap-2">
							<s className="text-[28px] leading-none font-semibold tabular-nums text-(--publy-foreground-subtle)">
								{t(tier.priceI18nKey)}
							</s>
							<span className="sr-only">{t('pricing-struck-aria')}</span>
							<span className="publy-type-eyebrow text-(--publy-foreground-muted)">
								{t('pricing-per-month')}
							</span>
						</p>
						<p className="publy-type-eyebrow text-(--publy-primary-soft-foreground)">
							{t('pricing-beta-note')}
						</p>
						<p className="ld07-body-small max-w-[40ch] text-(--publy-foreground-secondary)">
							{t(tier.descriptionI18nKey)}
						</p>
						<hr className="ld07-dashed-rule mt-auto" />
						<Link
							to="/signup"
							className="inline-flex h-10 items-center justify-center rounded-[var(--publy-radius-control)] border border-(--publy-rule-strong) px-4 text-[14px]/[20px] font-semibold tracking-(--publy-tracking-text) text-(--publy-foreground) no-underline transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px active:duration-50"
						>
							{t(tier.ctaI18nKey)}
						</Link>
					</div>
				))}
			</div>
		</div>
	);
};
