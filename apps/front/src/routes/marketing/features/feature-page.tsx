import { useParams } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { FeatureBenefitGrid } from '#app/routes/marketing/_components/feature-benefit-grid.tsx';
import { FeatureComparison } from '#app/routes/marketing/_components/feature-comparison.tsx';
import { FeatureHero } from '#app/routes/marketing/_components/feature-hero.tsx';
import { FeatureQuote } from '#app/routes/marketing/_components/feature-quote.tsx';
import { FeatureScreenshot } from '#app/routes/marketing/_components/feature-screenshot.tsx';
import { FeatureStepBand } from '#app/routes/marketing/_components/feature-step-band.tsx';
import { getFeature } from '#app/routes/marketing/_data/features.ts';

// ----------------------------------------------------------------------

const FeaturePage = () => {
	const { slug } = useParams<{ slug: string }>();
	const feature = getFeature(slug);

	if (!feature) {
		// Falls through to the marketing layout's catch-all `*` →
		// MarketingNotFoundPage. Throwing a Response keeps the SSR status
		// code accurate (404, not 200).
		throw new Response('Not Found', { status: 404 });
	}

	return (
		<>
			<FeatureHero
				eyebrow={feature.hero.eyebrow}
				eyebrowIcon={feature.hero.eyebrowIcon}
				title={feature.hero.title}
				subhead={feature.hero.subhead}
				primaryCta={feature.hero.primaryCta}
				secondaryCta={feature.hero.secondaryCta}
				socialProofText={feature.hero.socialProofText}
			/>

			<FeatureStepBand
				title={feature.steps.title}
				items={feature.steps.items}
			/>

			<FeatureBenefitGrid
				eyebrow={feature.benefits.eyebrow}
				title={feature.benefits.title}
				items={feature.benefits.items}
			/>

			{/* Anchor target for the hero's "See it in action" secondary CTA. */}
			<FeatureScreenshot
				id="demo"
				eyebrow={feature.screenshot.eyebrow}
				title={feature.screenshot.title}
				imageSlug={feature.screenshot.imageSlug}
				imageAlt={feature.screenshot.imageAlt}
				mockupUrl={feature.screenshot.mockupUrl}
			/>

			<FeatureComparison
				title={feature.comparison.title}
				items={feature.comparison.items}
			/>

			<FeatureQuote
				body={feature.quote.body}
				authorName={feature.quote.authorName}
				authorRole={feature.quote.authorRole}
				authorAvatarUrl={feature.quote.authorAvatarUrl}
			/>

			<CtaBand
				eyebrowLabel={feature.cta.eyebrowLabel}
				title={feature.cta.title}
				subhead={feature.cta.subhead}
				ctaLabel={feature.cta.ctaLabel}
				ctaHref={feature.cta.ctaHref}
				microcopy={feature.cta.microcopy}
			/>
		</>
	);
};

export default FeaturePage;

// ----------------------------------------------------------------------

// Per-feature SEO meta. React Router calls this with the same params as
// the route component, so we look up the feature by slug here too.
type MetaArgs = { params: { slug?: string } };

export const meta = ({ params }: MetaArgs) => {
	const feature = getFeature(params.slug);

	if (!feature) {
		return [{ title: `Not Found | ${APP_NAME}` }];
	}

	return [
		{ title: `${feature.metaTitle} | ${APP_NAME}` },
		{ name: 'description', content: feature.metaDescription },
		{ property: 'og:title', content: feature.metaTitle },
		{ property: 'og:description', content: feature.metaDescription },
		{ property: 'og:type', content: 'website' },
	];
};
