import { useState } from 'react';

import { type Billing } from '#app/routes/marketing/_data/pricing.ts';
import { HomeCta } from '#app/routes/marketing/home/parts/home-cta.tsx';

import { PricingComparison } from './parts/pricing-comparison.tsx';
import { PricingFaq } from './parts/pricing-faq.tsx';
import { PricingHero } from './parts/pricing-hero.tsx';
import { PricingTiers } from './parts/pricing-tiers.tsx';

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
