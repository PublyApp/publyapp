import { useState } from 'react';

import { JsonLd } from '#app/components/json-ld.tsx';
import { buildSeoMeta } from '#app/lib/seo/meta.ts';
import { buildFaqPageSchema } from '#app/lib/seo/schemas.ts';
import {
	type Billing,
	PRICING_FAQS,
} from '#app/routes/marketing/_data/pricing.ts';
import { HomeCta } from '#app/routes/marketing/home/_parts/home-cta.tsx';

import type { Route } from './+types/pricing-page';
import { PricingComparison } from './_parts/pricing-comparison.tsx';
import { PricingFaq } from './_parts/pricing-faq.tsx';
import { PricingHero } from './_parts/pricing-hero.tsx';
import { PricingTiers } from './_parts/pricing-tiers.tsx';

export const meta = ({ location }: Route.MetaArgs) => {
	return buildSeoMeta({
		title: 'Pricing — PublyApp',
		description:
			'Choose the plan that fits your team size and posting volume. Start free, upgrade as you grow.',
		pathname: location.pathname,
	});
};

const PricingPage = () => {
	const [billing, setBilling] = useState<Billing>('monthly');

	return (
		<>
			<JsonLd schema={buildFaqPageSchema(PRICING_FAQS)} />
			<PricingHero billing={billing} onBillingChange={setBilling} />
			<PricingTiers billing={billing} />
			<PricingComparison billing={billing} />
			<PricingFaq />
			<HomeCta />
		</>
	);
};

export default PricingPage;
