'use client';

// import { ReactNode } from 'react';
import { Box, Typography, useTheme } from '@mui/material';

import { initParseFront } from '../../utils/initParseFront';

import LogInForm from './LogInForm';

// type Props = {
// 	children: ReactNode;
// };

initParseFront();

const Login = (/* { children }: Props */) => {
	const theme = useTheme();

	return (
		<Box
			sx={{
				bgcolor: theme.palette.grey[200],
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				height: '100vh',
			}}
		>
			<Box>
				<Typography>LogIn</Typography>
				<LogInForm />
			</Box>
		</Box>
	);
};

export default Login;
