import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';

import { HEADER } from '@front/lib/constants';

import Header from './Header';

type Props = { children: ReactNode };

const MainLayout = ({ children }: Props) => {
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: 1 }}>
			<Header /* headerOnDark={actionPage(pathsOnDark)} */ />
			<Box
				component="main"
				sx={{
					flexGrow: 1,
				}}
			>
				{/* {!actionPage(spacingLayout) && <Spacing />} */}
				<Toolbar
					variant="dense"
					sx={{ /* bgcolor: 'red', */ height: { xs: HEADER.H_MOBILE, md: HEADER.H_MAIN_DESKTOP } }}
				/>
				{/* <Outlet /> */}
				{children}
			</Box>
			{/* <Footer /> */} {/* TODO: Later */}
		</Box>
	);
};

export default MainLayout;
