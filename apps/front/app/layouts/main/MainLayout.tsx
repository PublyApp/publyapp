/* eslint-disable @typescript-eslint/no-use-before-define */
import type { ReactNode } from 'react';

import { Box } from '@mui/material';
import { Outlet } from '@remix-run/react';

// import Footer from './footer/Footer';
import { HEADER } from '@/front/lib/constants';

import Header from './Header';

// ----------------------------------------------------------------------

// const pathsOnDark = ['/career/landing', '/travel/landing'];

// const spacingLayout = [...pathsOnDark, '/', '/e-learning/landing', '/marketing/landing'];

// ----------------------------------------------------------------------

type Props = { children: ReactNode };

const MainLayout = ({ children }: Props) => {
	// const { pathname } = useLocation();

	// const actionPage = (arr: string[]) => {
	// 	return arr.some((path) => {
	// 		return pathname === path;
	// 	});
	// };

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: 1 }}>
			<Header headerOnDark={false} /* headerOnDark={actionPage(pathsOnDark)} */ />

			<Box
				component="main"
				sx={{
					flexGrow: 1,
				}}
			>
				{/* {!actionPage(spacingLayout) && <Spacing />} */}
				<Spacing />
				{children ?? <Outlet />}
			</Box>

			{/* <Footer /> */}
		</Box>
	);
};

export default MainLayout;

// ----------------------------------------------------------------------

const Spacing = () => {
	return (
		<Box
			sx={{
				height: { xs: HEADER.H_MOBILE, md: HEADER.H_MAIN_DESKTOP },
			}}
		/>
	);
};
