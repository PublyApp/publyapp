import { Button, useTheme } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
	ErrorComponent,
	createFileRoute,
	redirect,
	Outlet,
	type ErrorComponentProps,
	useNavigate,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { View403 } from '~/components/View403';
import { clearTenantSuspensionCookie, toApiFailure } from '~/lib/api-failure';
import { getSessionTokensIsomorphic } from '~/server/request-context';
import { clearSession } from '~/server/session-actions';

export const Route = createFileRoute('/_authed-layout')({
	beforeLoad: async () => {
		const { staffToken, tenantToken } = await getSessionTokensIsomorphic();

		if (!staffToken && !tenantToken) {
			throw redirect({
				to: '/login',
			});
		}
	},
	errorComponent: AuthedLayoutErrorComponent,
	component: AuthedLayout,
});

function AuthedLayout() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="min-h-screen">
			<div className="p-2 flex gap-2 border-b">
				<Button
					variant="primary"
					onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
				>
					Toggle theme
				</Button>
			</div>
			<Outlet />
		</div>
	);
}

const TENANT_SUSPENDED_TRANSLATION_KEY = 'tenant-suspended';

function AuthedLayoutErrorComponent(props: ErrorComponentProps) {
	const { error } = props;
	const failure = toApiFailure(error);
	const navigate = useNavigate();

	if (failure.kind === 'problem' && failure.status === 401) {
		return <LogoutRedirect />;
	}

	if (
		failure.kind === 'problem' &&
		failure.status === 403 &&
		failure.translationKey === TENANT_SUSPENDED_TRANSLATION_KEY
	) {
		return <TenantSuspendedView />;
	}

	if (failure.kind === 'problem' && failure.status === 403) {
		return <View403 />;
	}

	return (
		<div className="p-4">
			<ErrorComponent {...props} />
			<Button
				variant="primary"
				onPress={() => {
					void navigate({
						to: '/login',
					});
				}}
			>
				Go to login
			</Button>
		</div>
	);
}

function LogoutRedirect() {
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

function TenantSuspendedView() {
	useEffect(() => {
		clearTenantSuspensionCookie();
	}, []);

	return (
		<div className="p-6">
			This tenant is suspended. Please contact support or switch accounts.
		</div>
	);
}
