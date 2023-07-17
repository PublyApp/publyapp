import { Box, Typography, useTheme } from '@mui/material';
// import { useQuery } from '@tanstack/react-query';
// import { Navigate } from 'react-router-dom';
import { useRouter } from 'next/router';

import { useAuth } from '@aktiveo/ui-react/hooks/useAuth';

import LogInForm from '../../containers/logIn/LogInForm';

const LogIn = () => {
	const { isAuthed } = useAuth();
	const theme = useTheme();
	const router = useRouter();

	if (isAuthed) {
		// return <Navigate to="/" />;
		router.replace('/');
	}
	// useEffect(() => {
	// 	if (isAuthed) router.replace('/');
	// }, [isAuthed, router]);

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
