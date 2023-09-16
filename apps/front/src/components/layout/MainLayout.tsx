import { ReactNode } from 'react';

import { Box, Toolbar } from '@mui/material';

import { HEADER } from '@front/utils/constants';

import Header from '../Header';

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
