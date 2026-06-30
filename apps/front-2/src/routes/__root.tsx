import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';

import appCss from '../styles/app.css?url';
import { MarketingLayout } from '../layouts/marketing-layout';

const THEME_STORAGE_KEY = 'publyapp:color-scheme';
const preHydrateThemeScript = `
	(() => {
		try {
			const nextTheme = localStorage.getItem('${THEME_STORAGE_KEY}');
			const theme =
				nextTheme === 'dark' || nextTheme === 'light' ? nextTheme : 'light';
			const root = document.documentElement;
			root.classList.remove('dark', 'light');
			root.classList.add(theme);
			root.dataset.theme = theme;
		} catch {
			const root = document.documentElement;
			root.classList.add('light');
			root.dataset.theme = 'light';
		}
	})();
`;

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'front-2' },
		],
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	component: () => (
		<html lang="en" className="front-2-shell light">
			<head>
				<script
					dangerouslySetInnerHTML={{ __html: preHydrateThemeScript }}
					suppressHydrationWarning
				/>
				<HeadContent />
			</head>
			<body>
				<MarketingLayout>
					<Outlet />
				</MarketingLayout>
				<Scripts />
			</body>
		</html>
	),
});
