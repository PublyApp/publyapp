// import { useEffect } from 'react';

import { Box, Typography, useTheme } from '@mui/material';

// import { useNavigate } from 'react-router-dom';

// import { BO_PATH_NAMES } from '@devist/shared/lib/constants';
// import { useGetClientAuth } from '@devist/ui-react/lib/react-query/features/auth/auth.hooks';

import LogInForm from './LogInForm';

const LogIn = () => {
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

export default LogIn;
