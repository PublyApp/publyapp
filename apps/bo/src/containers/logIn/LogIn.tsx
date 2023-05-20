import { FormEventHandler, useState } from 'react';

import { Box, Button, TextField } from '@mui/material';

const LogIn = () => {
	// State variables for form inputs
	const [password, setPassword] = useState('');
	const [email, setEmail] = useState('');

	const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
		e.preventDefault();
		console.log('Submitted!', email, password);
		// Perform further actions, such as sending data to a server
	};

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
