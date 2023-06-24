import CssBaseline from '@mui/material/CssBaseline';
// import { ThemeProvider } from '@mui/material';
import { ThemeProvider } from '@emotion/react';
import { AppProps } from 'next/app';
import Head from 'next/head';

import { theme } from '@aktiveo/ui-react/utils/theme';

import Layout from '../components/layout/Layout';

const MyApp = ({ Component, pageProps }: AppProps) => {
	return (
		<ThemeProvider theme={theme}>
			<Head>
				<title>Aktiveo</title>
			</Head>
			<CssBaseline />
			<Layout>
				{/* eslint-disable-next-line react/jsx-props-no-spreading */}
				<Component {...pageProps} />
			</Layout>
		</ThemeProvider>
	);
};

export default MyApp;
