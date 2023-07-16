// import Parse from 'parse';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { HydrationBoundary } from '@tanstack/react-query';

import '@aktiveo/ui-react/styles/fonts.css';
import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';
import QueryProvider from '@aktiveo/ui-react/providers/QueryProvider';
import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';

import Layout from '../components/layout/Layout';

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                    //
// --------------------------------------------------------------------------------------/
const isServer = typeof window === 'undefined';

// ---- code copied from parse-react/ssr -------------------------------------------------
if ((process as any).browser) {
	// eslint-disable-next-line global-require
	global.Parse = require('parse');
} else {
	// eslint-disable-next-line global-require
	global.Parse = require('parse/node');
}

Parse.initialize('aktiveo');

if (!isServer) {
	Parse.enableLocalDatastore();
}
// ---- end of code copied from parse-react/ssr -------------------------------------------------

Parse.serverURL = 'http://localhost:6180/parse';

const MyApp = ({ Component, pageProps }: AppProps) => {
	return (
		<>
			<Head>
				<title>Aktiveo</title>
			</Head>
			<AuthProvider>
				<QueryProvider>
					<HydrationBoundary state={pageProps.dehydratedState}>
						<ThemeProvider>
							<Layout>
								{/* eslint-disable-next-line react/jsx-props-no-spreading */}
								<Component {...pageProps} />
							</Layout>
						</ThemeProvider>
					</HydrationBoundary>
				</QueryProvider>
			</AuthProvider>
		</>
	);
};

export default MyApp;
