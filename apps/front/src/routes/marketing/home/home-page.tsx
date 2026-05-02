import type { Route } from './+types/home-page';
import { HomeCta } from './parts/home-cta';
import { HomeFaq } from './parts/home-faq';
import { HomeFeatures } from './parts/home-features';
import { HomeHero } from './parts/home-hero';
import { HomeLogos } from './parts/home-logos';
import { HomeOnboarding } from './parts/home-onboarding';
import { HomePricing } from './parts/home-pricing';

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
