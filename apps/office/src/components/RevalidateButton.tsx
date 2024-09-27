import Button from '@mui/material/Button';
import { useRevalidator } from 'react-router-dom';

const RevalidateButton = () => {
	const { revalidate } = useRevalidator();

	return (
		<Button
			type="button"
			onClick={() => {
				revalidate();
			}}
			sx={(theme) => {
				return { margin: '0 auto', background: theme.palette.common.black };
			}}
			variant="contained"
		>
			retry
		</Button>
	);
};

export default RevalidateButton;
