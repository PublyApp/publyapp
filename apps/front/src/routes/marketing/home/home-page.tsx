import { buildSeoMeta } from '#app/lib/seo/meta.ts';

import type { Route } from './+types/home-page';
import { HomeCta } from './_parts/home-cta';
import { HomeFaq } from './_parts/home-faq';
import { HomeFeatures } from './_parts/home-features';
import { HomeHero } from './_parts/home-hero';
import { HomeLogos } from './_parts/home-logos';
import { HomeOnboarding } from './_parts/home-onboarding';
import { HomePricing } from './_parts/home-pricing';

export const meta = ({ location }: Route.MetaArgs) => {
	return buildSeoMeta({
		title: 'PublyApp — Modern social media management for teams',
		description:
			'Plan, schedule, and publish across every platform from one workspace. Built for marketing teams that ship daily.',
		pathname: location.pathname,
	});
};

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	return (
		<>
			<HomeHero />
			<HomeLogos />
			<HomeFeatures />
			<HomeOnboarding />
			<HomePricing />
			<HomeFaq />
			<HomeCta />
		</>
	);
};

export default HomePage;
