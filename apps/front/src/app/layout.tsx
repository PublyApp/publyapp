import MotionLazy from '@devist/ui-react/components/MotionLazy';
import SnackbarProvider from '@devist/ui-react/providers/SnackbarProvider';
import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import NextAppDirEmotionCacheProvider from '@front/providers/NextAppDirEmotionCacheProvider';

import '../lib/i18n';
import 'react-lazy-load-image-component/src/effects/blur.css';

export const metadata = {
	title: 'Minimal UI Kit',
	description:
		'The starting point for your next project with Minimal UI Kit, built on the newest version of Material-UI ©, ready to be customized to your style',
	keywords: 'react,material,kit,application,dashboard,admin,template',
	themeColor: '#000000',
	manifest: '/manifest.json',
	viewport: {
		width: 'device-width',
		initialScale: 1,
		maximumScale: 1,
	},
	icons: [
		{
			rel: 'icon',
			url: '/favicon/favicon.ico',
		},
		{
			rel: 'icon',
			type: 'image/png',
			sizes: '16x16',
			url: '/favicon/favicon-16x16.png',
		},
		{
			rel: 'icon',
			type: 'image/png',
			sizes: '32x32',
			url: '/favicon/favicon-32x32.png',
		},
		{
			rel: 'apple-touch-icon',
			sizes: '180x180',
			url: '/favicon/apple-touch-icon.png',
		},
	],
};

type Props = {
	children: React.ReactNode;
};

const RootLayout = ({ children }: Props) => {
	return (
		<html lang="en" /* className={primaryFont.className} */>
			<body>
				<NextAppDirEmotionCacheProvider options={{ key: 'css' }}>
					<ThemeProvider>
						<MotionLazy>
							<SnackbarProvider>
								{/* <ProgressBar /> */}
								{children}
							</SnackbarProvider>
						</MotionLazy>
					</ThemeProvider>
				</NextAppDirEmotionCacheProvider>
			</body>
		</html>
	);
};

export default RootLayout;
