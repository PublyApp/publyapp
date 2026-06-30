import { Button, Input, Spinner } from '@heroui/react';
import {
	isRouteErrorResponse,
	useNavigate,
	createFileRoute,
} from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { completeLoginRedirect, login } from '~/lib/server/session-actions';
import {
	queryParamKey,
	queryParamValue,
} from '@org/shared-ts/lib/constants';
import { getFailureMessage, toApiFailure } from '~/lib/api-failure';
import type { Route } from './+types/login';

type LoginFormValues = {
	email: string;
	password: string;
};

const resolveRouteRedirect = (path: string | null): string => {
	if (!path) {
		return '/';
	}

	if (!path.startsWith('/') || path.startsWith('//')) {
		return '/';
	}

	return path;
};

const getSafeSearchRedirect = () => {
	const params = new URLSearchParams(window.location.search);
	return resolveRouteRedirect(params.get(queryParamKey.login_page.redirect_to));
};

const LoginRoute = () => {
	const navigate = useNavigate();
	const [showForbidden, setShowForbidden] = useState(false);
	const [showAuthUnauthorized, setShowAuthUnauthorized] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [isSessionExpired, setIsSessionExpired] = useState(false);
	const loginAction = useServerFn(login);
	const completeRedirect = useServerFn(completeLoginRedirect);

	const {
		register,
		handleSubmit,
		formState: { isSubmitting },
		setError,
	} = useForm<LoginFormValues>({
		defaultValues: {
			email: '',
			password: '',
		},
	});

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (
			params.get(queryParamKey.login_page.redirect_cause) ===
			queryParamValue.login_page.redirect_cause.invalid_session
		) {
			setIsSessionExpired(true);
		}
	}, []);

	const onSubmit = async (values: LoginFormValues) => {
		setShowForbidden(false);
		setShowAuthUnauthorized(false);
		setErrorMessage('');

		try {
			const { sessionExpiresAt } = await loginAction({
				data: {
					email: values.email,
					password: values.password,
				},
			});

			const redirect = await completeRedirect({
				data: { sessionExpiresAt },
			});
			const target = getSafeSearchRedirect();

			const resolvedTarget = resolveRouteRedirect(
				target === '/' ? redirect.targetPath : target,
			);
			await navigate({
				to: resolvedTarget,
				replace: true,
			});
		} catch (error) {
			const failure = toApiFailure(error);

			if (failure.kind === 'problem' && failure.status === 401) {
				setShowAuthUnauthorized(true);
				return;
			}

			if (failure.kind === 'problem' && failure.status === 403) {
				setShowForbidden(true);
				return;
			}

			if (failure.kind === 'validation') {
				setError('email', {
					message:
						failure.fieldErrors.email?.[0] ??
						getFailureMessage(failure, {
							fallback: 'Enter a valid email and password.',
						}),
				});
				return;
			}

			const message = getFailureMessage(failure, {
				fallback: 'Sign in failed. Please check your credentials.',
			});
			setErrorMessage(message);
		}
	};

	return (
		<div className="mx-auto w-full max-w-md space-y-4 px-4">
			{isSessionExpired ? (
				<p className="rounded border border-warning bg-warning-100 px-3 py-2 text-sm text-warning-900">
					Your session expired. Please sign in again.
				</p>
			) : null}

			{showForbidden ? <View403 /> : null}
			{showAuthUnauthorized ? (
				<AppErrorView
					icon="401"
					code="401 — Unauthorized"
					title="Authentication required"
					description="Your login request could not be authorized. Please verify your credentials and try again."
					testId="auth-401-view"
					actions={
						<Button
							variant="solid"
							color="primary"
							as="a"
							href="/login"
						>
							Back to login
						</Button>
					}
				/>
			) : null}

			{showAuthUnauthorized ? null : (
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
					<Input
						{...register('email', { required: true })}
						isRequired
						label="Email"
						placeholder="name@company.com"
						type="email"
					/>
					<Input
						{...register('password', { required: true })}
						isRequired
						label="Password"
						type="password"
						placeholder="••••••••"
					/>
					{errorMessage ? (
						<div
							data-testid="login-error-message"
							className="text-sm text-danger-500"
						>
							{errorMessage}
						</div>
					) : null}
					<Button
						type="submit"
						variant="solid"
						color="primary"
						isDisabled={isSubmitting}
						className="w-full"
					>
						{isSubmitting ? <Spinner color="white" size="sm" /> : null}
						Sign in
					</Button>
				</form>
			)}
		</div>
	);
};

const getFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	if (failure.kind === 'problem') {
		return failure.status;
	}

	if (isRouteErrorResponse(error)) {
		return error.status;
	}

	return undefined;
};

const LoginErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	const navigate = useNavigate();
	const routeStatus = getFailureStatus(error);

	if (routeStatus === 401) {
		return (
			<AppErrorView
				icon="401"
				code="401 — Unauthorized"
				title="Authentication required"
				description="Your login request could not be authorized. Please verify your credentials and try again."
				testId="auth-401-view"
				actions={
					<Button
						variant="solid"
						color="primary"
						as="a"
						href="/login"
					>
						Back to login
					</Button>
				}
			/>
		);
	}

	if (routeStatus === 403) {
		return <View403 />;
	}

	if (routeStatus === 404) {
		return <AppErrorView icon="404" code="404 — Not Found" title="Page not found" />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Something went wrong"
			description="Sign-in could not be completed."
		/>
	);
};

export const Route = createFileRoute('/login')({
	component: LoginRoute,
	errorComponent: LoginErrorBoundary,
});
