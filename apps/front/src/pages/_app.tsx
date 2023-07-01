// import Parse from 'parse';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { HydrationBoundary } from '@tanstack/react-query';

import '@aktiveo/ui-react/styles/fonts.css';
import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';

import Layout from '../components/layout/Layout';
import { AuthProvider } from '../contexts/AuthProvider';
import QueryProvider from '../providers/QueryProvider';

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                   //
// --------------------------------------------------------------------------------------//
if (typeof window !== 'undefined') {
	Parse.initialize('aktiveo');

	const parseServerURL = 'http://localhost:6182/parse';
	Parse.serverURL = parseServerURL;
}

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
