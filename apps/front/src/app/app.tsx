// 'use client';

import { ReactNode } from 'react';

// import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';

import QueryNextProvider from '../providers/QueryNextProvider';
import LayoutFront from '../components/layout/LayoutFront';
import ThemeProviderNext from '../providers/ThemeProviderNext';
// import { initParseFront } from '../utils/initParseFront';

type Props = { children: ReactNode };

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                    //
// --------------------------------------------------------------------------------------//
// initParseFront();

const AppFront = ({ children }: Props) => {
	return (
		// <AuthProvider>
		<QueryNextProvider>
			<ThemeProviderNext>
				<LayoutFront>{children}</LayoutFront>
			</ThemeProviderNext>
		</QueryNextProvider>
		// </AuthProvider>
	);
};

export default AppFront;
