import { FormEventHandler, useState } from 'react';

import { Box, Button, CircularProgress, TextField } from '@mui/material';
// import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';

// import { logInFn } from '../../reactQuery/queryFns/logIn.fn';
import { useAuth } from '../../hooks/useAuth';
// import { useBreadcrumbs } from '../../hooks/useBreadcrumbs';

const LogIn = () => {
	// State variables for form inputs
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');

	const { logIn, isAuthed, isLogInLoading } = useAuth();

	const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
		e.preventDefault();
		console.log('Submitted!', email, password);
		// await refetch();
		await logIn({ email, password });
	};

	if (isAuthed) {
		return <Navigate to="/" />;
	}

	return (
		<Box
			sx={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				height: '100vh',
			}}
		>
			<Box
				component="form"
				onSubmit={handleSubmit}
				sx={{
					width: '400px',
					p: 2,
					border: '1px solid #ccc',
					borderRadius: '4px',
					backgroundColor: '#fff',
				}}
			>
				<TextField
					label="Email"
					value={email}
					onChange={(e) => {
						return setEmail(e.target.value);
					}}
					fullWidth
					margin="normal"
				/>

				<TextField
					label="Password"
					value={password}
					onChange={(e) => {
						return setPassword(e.target.value);
					}}
					fullWidth
					margin="normal"
					type="password"
				/>

				<Button type="submit" variant="contained" color="primary">
					{isLogInLoading ? <CircularProgress color="inherit" size="24px" /> : 'Submit'}
				</Button>
			</Box>
		</Box>
	);
};

export default LogIn;
