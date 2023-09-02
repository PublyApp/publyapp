import React from 'react';

import '@aktiveo/ui-react/styles/fonts.css';

// import { initParseFront } from '../utils/initParseFront';

import AppFront from './app';

// initParseFront();

const RootLayout = ({ children }: { children: React.ReactNode }) => {
	return (
		<html lang="en">
			<body>
				{/* <AuthProvider>
					<QueryNextProvider>
						<ThemeProviderNext>
							<LayoutFront>{children}</LayoutFront>
						</ThemeProviderNext>
					</QueryNextProvider>
				</AuthProvider> */}
				<AppFront>{children}</AppFront>
			</body>
		</html>
	);
};

export default RootLayout;
