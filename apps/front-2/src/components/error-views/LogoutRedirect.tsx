import { useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
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
	const { t } = useTranslation('common');
	const { pathname, searchStr } = useLocation();

	useEffect(() => {
		// Threads the page this 401 happened on through as `rto` so signing
		// back in returns the user here instead of dumping them at the
		// surface root (users-auth r2-F4) — this is the single mount point
		// every authed route's 401 error boundary renders, so fixing it here
		// covers every call site at once.
		logout({
			redirectCause: 'invalid_session',
			returnTo: `${pathname}${searchStr}`,
		});
	}, [logout, pathname, searchStr]);

	const Wrapper = embedded ? 'div' : 'main';

	return (
		<Wrapper
			className={cn(
				'mx-auto flex w-full max-w-3xl items-center justify-center px-4',
				embedded ? 'min-h-[50vh] py-8' : 'min-h-screen py-12',
			)}
		>
			<div className="text-center">
				<LoadingSpinner className="mx-auto block size-8" />
				<p className="mt-4 text-sm text-muted-foreground">
					{t('redirecting-to-login-description')}
				</p>
			</div>
		</Wrapper>
	);
};
