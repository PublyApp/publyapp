import { useCallback } from 'react';

import Button, { type ButtonProps } from '@mui/material/Button';

// import { useAuth0 } from '@auth0/auth0-react';
// import { useAuthContext } from 'src/auth/hooks';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';

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
			console.error(error);
			toast.error('Unable to logout!');
		}
	}, [onClose, router]);

	return (
		<Button fullWidth variant="soft" size="large" color="error" onClick={handleLogout} sx={sx} {...other}>
			Logout
		</Button>
	);
};
