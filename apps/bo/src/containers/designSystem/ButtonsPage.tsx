import { Button } from '@mui/material';

const ButtonsPage = () => {
	return (
		<>
			<Button variant="contained" raised={1}>
				lol
			</Button>
			<Button variant="contained" color="info">
				lol
			</Button>
			<Button variant="contained" color="warning" raised={1}>
				lol
			</Button>
			<Button variant="outlined">lol</Button>
			<Button>lol</Button>
		</>
	);
};

export default ButtonsPage;
