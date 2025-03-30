import { BackToTopButton } from '@/front/components/animate/back-to-top-button';
import { ScrollProgress } from '@/front/components/animate/scroll-progress/scroll-progress';
import { useScrollProgress } from '@/front/components/animate/scroll-progress/use-scroll-progress';

import type { Route } from './+types/HomePage';
import { HomeHero } from './parts/home-hero';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

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
