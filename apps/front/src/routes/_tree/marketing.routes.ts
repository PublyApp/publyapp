import { index, layout, route } from '@react-router/dev/routes';

// Marketing routes
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
		route('terms', 'routes/marketing/terms/terms-page.tsx'),
		route('privacy', 'routes/marketing/privacy/privacy-page.tsx'),
		route('cookies', 'routes/marketing/cookies/cookies-page.tsx'),
		route('about', 'routes/marketing/about/about-page.tsx'),
		route('contact', 'routes/marketing/contact/contact-page.tsx'),
		route('security', 'routes/marketing/security/security-page.tsx'),
		route('*', 'routes/marketing/_errors/marketing-not-found-page.tsx'),
	]),
];
