import { useEffect } from 'react';
import { useLogout } from '~/lib/hooks/use-logout';
import { cn } from '~/lib/utils';

type LogoutRedirectProps = {
	/**
	 * Renders inside an existing page shell (a `<div>`, no `min-h-screen`)
	 * instead of a full-viewport `<main>`. Defaults to `true` — see
	 * `AppErrorView`'s `embedded` doc for the rationale. Pass
	 * `embedded={false}` only for the root boundary's genuine full-page use.
	 */
	embedded?: boolean;
};

export const LogoutRedirect = ({
	embedded = true,
}: LogoutRedirectProps = {}) => {
	const { logout } = useLogout();

	useEffect(() => {
		logout({ redirectCause: 'invalid_session' });
	}, [logout]);

	const Wrapper = embedded ? 'div' : 'main';

	return (
		<Wrapper
			className={cn(
				'mx-auto flex w-full max-w-3xl items-center justify-center px-4',
				embedded ? 'min-h-[50vh] py-8' : 'min-h-screen py-12',
			)}
		>
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
		</Wrapper>
	);
};
