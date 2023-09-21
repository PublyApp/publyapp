import { FormEventHandler, useState } from 'react';

import { Box, Button, TextField, Typography } from '@mui/material';

import { useGetClientAuth } from '@devist/ui-react/query/features/auth/auth.hooks';

const Account = () => {
	const {
		result: { data, isLoading },
	} = useGetClientAuth();

	const [name, setName] = useState<string>('');
	const [email, setEmail] = useState<string>('');

	const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
		e.preventDefault();
		console.log('Name:', name);
		console.log('Email:', email);
	};

	return (
		<Box>
			<Box mb="2.5rem">
				<Typography variant="h1">Hello User!!</Typography>
				{isLoading ? (
					'Loading...'
				) : (
					<>
						<Typography>username: {data?.user?.username}</Typography>
						<Typography>email: {data?.user?.email}</Typography>
					</>
				)}
			</Box>
			<Typography variant="h5">Update your informations</Typography>
			<Box component="form" onSubmit={handleSubmit}>
				<TextField
					label="Name"
					fullWidth
					value={name}
					onChange={(e) => {
						return setName(e.target.value);
					}}
					margin="normal"
				/>
				<TextField
					label="Email"
					fullWidth
					value={email}
					onChange={(e) => {
						return setEmail(e.target.value);
					}}
					margin="normal"
				/>
				<Button type="submit" variant="contained" color="primary">
					Submit
				</Button>
			</Box>
		</Box>
	);
};

export default Account;
