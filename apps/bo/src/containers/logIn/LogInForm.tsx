import { Box, TextField } from '@mui/material';

const LogInForm = () => {
	return (
		<Box
			sx={{
				background: '#fff',
				border: '1px solid #e5e5e5',
				borderRadius: '10px',
				padding: '50px',
				marginBottom: '16px',
			}}
		>
			<Box component="form">
				<TextField
					id="outlined-basic"
					/* label="Outlined"  */
					sx={{
						// '& .MuiInputBase-input': {
						// 	backgroundColor: '#fff',
						// 	// borderColor: '#dbdbdb',
						// 	borderColor: 'red',
						// 	borderRadius: '44px',
						// 	color: '#363636',
						// },
						borderRadius: '44px',
					}}
				/>
			</Box>
		</Box>
	);
};

export default LogInForm;
