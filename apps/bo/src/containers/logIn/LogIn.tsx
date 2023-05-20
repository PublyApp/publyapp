import { FormEventHandler, useState } from 'react';

import { Box, Button, TextField } from '@mui/material';
// import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';

// import { logInFn } from '../../reactQuery/queryFns/logIn.fn';
import { useAuth } from '../../contexts/auth/useAuth';

const LogIn = () => {
	// State variables for form inputs
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');

	const { logIn, isAuthed } = useAuth();

	// const { data: logInResult, refetch } = useQuery({
	// 	queryKey: ['logIn', { email, password }],
	// 	queryFn: logInFn,
	// 	enabled: false,
	// });

	// useEffect(() => {
	// 	setUser();
	// }, [data]);

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
					Submit
				</Button>
			</Box>
		</Box>
	);
};

export default LogIn;
