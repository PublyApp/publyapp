import { Outlet, isRouteErrorResponse, redirect } from 'react-router';

import { BackToTopButton } from '#app/components/animate/back-to-top-button.tsx';
import { ScrollProgress } from '#app/components/animate/scroll-progress/scroll-progress.tsx';
import { useScrollProgress } from '#app/components/animate/scroll-progress/use-scroll-progress.ts';
import { MainLayout } from '#app/layouts/main/layout.tsx';
import { MarketingErrorView } from '#app/routes/marketing/_components/marketing-error-view.tsx';

import type { Route } from './+types/marketing-layout';

export const loader = ({ request }: Route.LoaderArgs) => {
	const url = new URL(request.url);

	// Skip root path (already in canonical '/' form).
	if (url.pathname === '/') {
		return null;
	}
	// Skip asset-like paths (anything with a '.' — e.g. /sitemap.xml, /robots.txt
	// when those become available in this layout's catchment).
	if (url.pathname.includes('.')) {
		return null;
	}
	// Already has trailing slash → no-op.
	if (url.pathname.endsWith('/')) {
		return null;
	}

	url.pathname += '/';
	throw redirect(url.toString(), 301);
};

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

// Catches any error thrown inside a marketing route (route 404 responses,
// loader throws, render exceptions). The catch-all `route('*', ...)` covers
// path-not-found; this boundary covers everything else and any explicit
// `throw new Response('', { status: 404 })` from a marketing loader.
export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	if (isRouteErrorResponse(error) && error.status === 404) {
		return (
			<MainLayout slotProps={{ nav: { data: [] } }}>
				<MarketingErrorView
					numeral="404"
					title="This post got deleted by the algorithm"
					subhead="Or maybe the link is broken. Either way — let's get you back on track."
				/>
			</MainLayout>
		);
	}

	return (
		<MainLayout slotProps={{ nav: { data: [] } }}>
			<MarketingErrorView
				numeral="500"
				title="Something broke on our end"
				subhead="An unexpected error stopped this page from loading. Try refreshing — if it keeps happening, one of the links below will get you somewhere useful."
			/>
		</MainLayout>
	);
};
