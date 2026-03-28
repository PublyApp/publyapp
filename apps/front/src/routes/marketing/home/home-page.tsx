import { BackToTopButton } from '#app/components/animate/back-to-top-button.tsx';
import { ScrollProgress } from '#app/components/animate/scroll-progress/scroll-progress.tsx';
import { useScrollProgress } from '#app/components/animate/scroll-progress/use-scroll-progress.ts';

import type { Route } from './+types/home-page';
import { HomeHero } from './parts/home-hero';

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
		</>
	);
};

export default HomePage;
