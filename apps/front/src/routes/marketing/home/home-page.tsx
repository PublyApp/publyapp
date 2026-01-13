import { BackToTopButton } from '@/front/components/animate/back-to-top-button';
import { ScrollProgress } from '@/front/components/animate/scroll-progress/scroll-progress';
import { useScrollProgress } from '@/front/components/animate/scroll-progress/use-scroll-progress';
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
