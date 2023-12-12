// eslint-disable-next-line @typescript-eslint/consistent-type-imports
// import * as React from 'react';

import { Box, Container } from '@mui/material';

// import Box from '@mui/material/Box';
// import Container from '@mui/material/Container';

// import Copyright from './Copyright';
// import ProTip from './ProTip';

const Layout = ({ children }: { children: React.ReactNode }) => {
	return (
		<Container maxWidth="sm">
			<Box sx={{ my: 4 }}>
				{children}
				{/* <ProTip /> */}
				{/* <Copyright /> */}
			</Box>
		</Container>
	);
};

export default Layout;
