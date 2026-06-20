import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { clearSession } from '~/server/session-actions';

export function LogoutRedirect() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	useEffect(() => {
		queryClient.clear();
		void clearSession().finally(() => {
			void navigate({
				to: '/login',
				search: { redirect_cause: 'invalid_session' },
			});
		});
	}, [navigate, queryClient]);

	return (
		<div className="p-6">
			You were signed out because your session is no longer valid.
			Redirecting...
		</div>
	);
}
