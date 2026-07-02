import { Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect } from 'react';
import { clearSession } from '~/lib/server/session-actions';

import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

export const LogoutRedirect = () => {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const clear = useServerFn(clearSession);

	useEffect(() => {
		queryClient.clear();
		void clear().finally(() => {
			void navigate({
				to: '/login',
				search: {
					[queryParamKey.login_page.redirect_cause]:
						queryParamValue.login_page.redirect_cause.invalid_session,
				},
				replace: true,
			});
		});
	}, [queryClient, clear, navigate]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-12">
			<div className="text-center">
				<Spinner size="lg" />
				<p className="mt-4 text-sm text-foreground-500">
					Your session is no longer valid. Redirecting to login...
				</p>
			</div>
		</main>
	);
};
