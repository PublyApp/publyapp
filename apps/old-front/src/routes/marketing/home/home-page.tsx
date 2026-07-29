import type { Route } from './+types/home-page';
import { HomeCta } from './_parts/home-cta';
import { HomeFaq } from './_parts/home-faq';
import { HomeFeatures } from './_parts/home-features';
import { HomeHero } from './_parts/home-hero';
import { HomeLogos } from './_parts/home-logos';
import { HomeOnboarding } from './_parts/home-onboarding';
import { HomePricing } from './_parts/home-pricing';

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
