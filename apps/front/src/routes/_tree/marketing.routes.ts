import { index, layout } from '@react-router/dev/routes';

// Marketing routes
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
	]),
];
