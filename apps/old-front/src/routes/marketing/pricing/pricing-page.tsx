import { useState } from 'react';

import { type Billing } from '#app/routes/marketing/_data/pricing.ts';
import { HomeCta } from '#app/routes/marketing/home/_parts/home-cta.tsx';

import { PricingComparison } from './_parts/pricing-comparison.tsx';
import { PricingFaq } from './_parts/pricing-faq.tsx';
import { PricingHero } from './_parts/pricing-hero.tsx';
import { PricingTiers } from './_parts/pricing-tiers.tsx';

const PricingPage = () => {
	const [billing, setBilling] = useState<Billing>('monthly');

	return (
		<>
			<PricingHero billing={billing} onBillingChange={setBilling} />
			<PricingTiers billing={billing} />
			<PricingComparison billing={billing} />
			<PricingFaq />
			<HomeCta />
		</>
	);
};

export default PricingPage;
