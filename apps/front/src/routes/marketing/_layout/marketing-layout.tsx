import { Outlet } from 'react-router';

import { BackToTopButton } from '#app/components/animate/back-to-top-button.tsx';
import { ScrollProgress } from '#app/components/animate/scroll-progress/scroll-progress.tsx';
import { useScrollProgress } from '#app/components/animate/scroll-progress/use-scroll-progress.ts';
import { MainLayout } from '#app/layouts/main/layout.tsx';

const MarketingLayout = () => {
	const pageProgress = useScrollProgress();

	return (
		<MainLayout slotProps={{ nav: { data: [] } }}>
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
			<Outlet />
		</MainLayout>
	);
};

export default MarketingLayout;
