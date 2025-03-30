import Button, { type ButtonProps } from '@mui/material/Button';

import { RouterLink } from '@/front/components/router-link';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

// import { RouterLink } from 'src/routes/components';

// import { CONFIG } from 'src/global-config';

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
