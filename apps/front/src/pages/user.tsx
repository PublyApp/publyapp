import { Box, Typography } from '@mui/material';

import { useAuth } from '@aktiveo/ui-react/hooks/useAuth';

const User = () => {
	const { user } = useAuth();

	return (
		<Box mb="2.5rem">
			<Typography variant="h1">Hello User!!</Typography>
			<Typography>username: {user?.username}</Typography>
			<Typography>email: {user?.email}</Typography>
		</Box>
	);
};

export default User;
