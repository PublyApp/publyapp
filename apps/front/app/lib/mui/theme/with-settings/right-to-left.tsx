import { useEffect } from 'react';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import rtlPlugin from 'stylis-plugin-rtl';

import type { ThemeDirection } from '../types';

// ----------------------------------------------------------------------

type RtlProps = {
	children: React.ReactNode;
	direction: ThemeDirection;
};

const cacheRtl = createCache({
	key: 'rtl',
	prepend: true,
	stylisPlugins: [rtlPlugin],
});

export const Rtl = ({ children, direction }: RtlProps) => {
	useEffect(() => {
		document.dir = direction;
	}, [direction]);

	if (direction === 'rtl') {
		return <CacheProvider value={cacheRtl}>{children}</CacheProvider>;
	}

	// eslint-disable-next-line react/jsx-no-useless-fragment
	return <>{children}</>;
};
