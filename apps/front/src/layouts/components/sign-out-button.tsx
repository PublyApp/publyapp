import Button, { type ButtonProps } from '@mui/material/Button';

// ----------------------------------------------------------------------

type Props = ButtonProps;

export const SignOutButton = ({ sx, ...other }: Props) => {
	return (
		<Button
			fullWidth
			variant="soft"
			size="large"
			color="error"
			sx={sx}
			{...other}
		>
			Logout
		</Button>
	);
};
