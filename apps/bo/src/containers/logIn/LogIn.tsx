import { Box, Typography, useTheme } from '@mui/material';
// import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@aktiveo/ui-react/hooks/useAuth';

import LogInForm from './LogInForm';

const LogIn = () => {
	const { isAuthed } = useAuth();
	const theme = useTheme();

	if (isAuthed) {
		return <Navigate to="/" />;
	}

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
