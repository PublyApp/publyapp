import { useState } from 'react';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@emotion/react';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { HydrationBoundary, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { theme } from '@aktiveo/ui-react/utils/theme';
import '@aktiveo/ui-react/styles/fonts.css';

import Layout from '../components/layout/Layout';

const MyApp = ({ Component, pageProps }: AppProps) => {
	const [queryClient] = useState(() => {
		return new QueryClient();
	});

	return (
		<>
			<Head>
				<title>Aktiveo</title>
			</Head>
			<QueryClientProvider client={queryClient}>
				<HydrationBoundary state={pageProps.dehydratedState}>
					<ThemeProvider theme={theme}>
						<CssBaseline />
						<Layout>
							{/* eslint-disable-next-line react/jsx-props-no-spreading */}
							<Component {...pageProps} />
						</Layout>
					</ThemeProvider>
				</HydrationBoundary>
			</QueryClientProvider>
		</>
	);
};

export default MyApp;
