import { useEffect } from 'react';
import { useLogout } from '~/lib/hooks/use-logout';

export const LogoutRedirect = () => {
	const { logout } = useLogout();

	useEffect(() => {
		logout({ redirectCause: 'invalid_session' });
	}, [logout]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-12">
			<div className="text-center">
				<span
					role="status"
					aria-label="Loading"
					className="mx-auto block size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
				/>
				<p className="mt-4 text-sm text-muted-foreground">
					Your session is no longer valid. Redirecting to login...
				</p>
			</div>
		</main>
	);
};
