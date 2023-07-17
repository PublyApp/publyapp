'use client';

import { ReactNode } from 'react';

import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';

import QueryNextProvider from '../providers/QueryNextProvider';
import LayoutFront from '../components/layout/LayoutFront';
import ThemeProviderNext from '../providers/ThemeProviderNext';

type Props = { children: ReactNode };

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                    //
// --------------------------------------------------------------------------------------/
const isServer = typeof window === 'undefined';

// ---- code copied from parse-react/ssr -------------------------------------------------
if (/* (process as any).browser */ !isServer) {
	// eslint-disable-next-line global-require
	global.Parse = require('parse');
	// eslint-disable-next-line global-require
	// window.Parse = require('parse');
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

const AppFront = ({ children }: Props) => {
	return (
		<AuthProvider>
			<QueryNextProvider>
				<ThemeProviderNext>
					<LayoutFront>{children}</LayoutFront>
				</ThemeProviderNext>
			</QueryNextProvider>
		</AuthProvider>
	);
};

export default AppFront;
