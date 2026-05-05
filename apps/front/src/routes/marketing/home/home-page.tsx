import { BackToTopButton } from '#app/components/animate/back-to-top-button.tsx';
import { ScrollProgress } from '#app/components/animate/scroll-progress/scroll-progress.tsx';
import { useScrollProgress } from '#app/components/animate/scroll-progress/use-scroll-progress.ts';

import type { Route } from './+types/home-page';
import { HomeCta } from './parts/home-cta';
import { HomeFaq } from './parts/home-faq';
import { HomeFeatures } from './parts/home-features';
import { HomeHero } from './parts/home-hero';
import { HomeLogos } from './parts/home-logos';
import { HomeOnboarding } from './parts/home-onboarding';
import { HomePricing } from './parts/home-pricing';

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	const pageProgress = useScrollProgress();

	return (
		<>
			<ScrollProgress
				variant="linear"
				progress={pageProgress.scrollYProgress}
				sx={[
					(theme) => {
						return { position: 'fixed', zIndex: theme.zIndex.appBar + 1 };
					},
				]}
			/>

			<BackToTopButton />

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
