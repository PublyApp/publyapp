import { Box, Typography } from '@mui/material';

import { useAuth } from '../../hooks/useAuth';

const Account = () => {
	const { user } = useAuth();
	return (
		<Box>
			<Typography variant="h1">Hello User!!</Typography>
			<Typography>username: {user?.username}</Typography>
			<Typography>email: {user?.email}</Typography>
		</Box>
	);
};

export default Account;
