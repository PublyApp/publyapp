import Button, { type ButtonProps } from '@mui/material/Button';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { RouterLink } from '@/front/components/router-link';

// ----------------------------------------------------------------------

export const SignInButton = ({ sx, ...other }: ButtonProps) => {
	return (
		<Button
			component={RouterLink}
			href={/* CONFIG.auth.redirectPath */ FRONT_PATH_NAMES.auth.login}
			variant="outlined"
			sx={sx}
			{...other}
		>
			Sign in
		</Button>
	);
};
