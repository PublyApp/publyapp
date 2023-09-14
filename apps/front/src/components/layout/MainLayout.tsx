import { ReactNode } from 'react';

import { Box } from '@mui/material';

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
				{/* <Outlet /> */}
				{children}
			</Box>
			{/* <Footer /> */} {/* TODO: Later */}
		</Box>
	);
};

export default MainLayout;
