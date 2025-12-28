import Button, { type ButtonProps } from '@mui/material/Button';
import { useCallback } from 'react';

// import { useAuth0 } from '@auth0/auth0-react';
// import { useAuthContext } from '@/front/auth/hooks';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getErrorMessage } from '@/shared/utils/error.utils';

// ----------------------------------------------------------------------

const signOut = async () => {
	/*  */
};

type Props = ButtonProps & {
	onClose?: () => void;
};

export const SignOutButton = ({ onClose, sx, ...other }: Props) => {
	const router = useRouter();

	// const { checkUserSession } = useAuthContext();

	// const { logout: signOutAuth0 } = useAuth0();

	const handleLogout = useCallback(async () => {
		try {
			await signOut();
			onClose?.();
			router.refresh();
		} catch (error) {
			logger.error(getErrorMessage(error), { error });
			toast.error('Unable to logout!');
		}
	}, [onClose, router]);

	return (
		<Button
			fullWidth
			variant="soft"
			size="large"
			color="error"
			onClick={handleLogout}
			sx={sx}
			{...other}
		>
			Logout
		</Button>
	);
};
