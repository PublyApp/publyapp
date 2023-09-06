'use client';

import { ReactNode, useState } from 'react';

import createCache from '@emotion/cache';
import { CacheProvider, ThemeProvider as EmotionProvider } from '@emotion/react';
import { createTheme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { useServerInsertedHTML } from 'next/navigation';

import { themeOptions } from '@aktiveo/ui-react/utils/theme';

type Props = {
	// eslint-disable-next-line react/require-default-props
	options?: any;
	children: ReactNode;
};

// This implementation is from emotion-js
// https://github.com/emotion-js/emotion/issues/2928#issuecomment-1319747902
const ThemeRegistry = (props: Props) => {
	const { options, children } = props;

	const theme = createTheme(themeOptions as any);

	const [{ cache, flush }] = useState(() => {
		// eslint-disable-next-line @typescript-eslint/no-shadow
		const cache = createCache(options || { key: 'css' });
		cache.compat = true;
		const prevInsert = cache.insert;
		let inserted: string[] = [];

		cache.insert = (...args) => {
			const serialized = args[1];

			if (cache.inserted[serialized.name] === undefined) {
				inserted.push(serialized.name);
			}

			return prevInsert(...args);
		};

		// eslint-disable-next-line @typescript-eslint/no-shadow
		const flush = () => {
			const prevInserted = inserted;
			inserted = [];
			return prevInserted;
		};

		return { cache, flush };
	});

	useServerInsertedHTML(() => {
		const names = flush();

		if (names.length === 0) {
			return null;
		}

		let styles = '';

		// eslint-disable-next-line no-restricted-syntax
		for (const name of names) {
			styles += cache.inserted[name];
		}

		return (
			<style
				key={cache.key}
				data-emotion={`${cache.key} ${names.join(' ')}`}
				// eslint-disable-next-line react/no-danger
				dangerouslySetInnerHTML={{
					__html: styles,
				}}
			/>
		);
	});

	return (
		<CacheProvider value={cache}>
			<EmotionProvider theme={theme}>
				<CssBaseline />
				{children}
			</EmotionProvider>
		</CacheProvider>
	);
};

export default ThemeRegistry;
