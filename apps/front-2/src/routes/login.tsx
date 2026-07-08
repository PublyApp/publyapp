import { Button, Input, Spinner } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
	useLocation,
	useNavigate,
	createFileRoute,
} from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { AlertCircle, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { completeLoginRedirect, login } from '~/lib/server/session-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

type LoginFormValues = {
	email: string;
	password: string;
};

const LoginFormSchema = z.object({
	email: z.string().max(120).email('Enter a valid email address.'),
	password: z.string().min(1, 'Password is required.'),
});

const resolveRouteRedirect = (path: string | null): string => {
	if (!path) {
		return '/';
	}

	if (!path.startsWith('/') || path.startsWith('//')) {
		return '/';
	}

	return path;
};

const getSafeSearchRedirect = (search: string): string => {
	const params = new URLSearchParams(search);
	return resolveRouteRedirect(params.get(queryParamKey.login_page.redirect_to));
};

const isAllowedRedirectPath = (
	requested: string,
	surfacePath: string,
): boolean => {
	if (!requested || !requested.startsWith('/')) {
		return false;
	}

	const normalizedSurface = surfacePath.replace(/\/$/, '');
	if (requested === normalizedSurface) {
		return true;
	}

	if (normalizedSurface === '/') {
		return true;
	}

	return requested.startsWith(`${normalizedSurface}/`);
};

const isSessionExpiredFromSearch = (search: string): boolean => {
	const params = new URLSearchParams(search);
	return (
		params.get(queryParamKey.login_page.redirect_cause) ===
		queryParamValue.login_page.redirect_cause.invalid_session
	);
};

const getFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	if (failure.kind === 'problem') {
		return failure.status;
	}

	return undefined;
};

const LoginRoute = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const [showForbidden, setShowForbidden] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const loginAction = useServerFn(login);
	const completeRedirect = useServerFn(completeLoginRedirect);
	const search = location.searchStr ?? '';
	const isSessionExpired = isSessionExpiredFromSearch(search);

	const {
		register,
		handleSubmit,
		setError,
		formState: { isSubmitting, errors },
	} = useForm<LoginFormValues>({
		resolver: zodResolver(LoginFormSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const onSubmit = async (values: LoginFormValues) => {
		setShowForbidden(false);
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
			const requested = getSafeSearchRedirect(search);
			const finalTarget = isAllowedRedirectPath(requested, redirect.targetPath)
				? requested
				: redirect.targetPath;
			const resolvedTarget = resolveRouteRedirect(finalTarget);

			await navigate({
				to: resolvedTarget,
				replace: true,
			});
		} catch (error) {
			const failure = toApiFailure(error);

			if (failure.kind === 'problem' && failure.status === 401) {
				setError('password', {
					message: getFailureMessage(failure, {
						fallback:
							'Invalid credentials. Please check your email and password.',
					}),
				});
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

			{showForbidden ? (
				<View403 />
			) : (
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
					<div className="space-y-1">
						<label
							className="text-sm font-medium text-foreground-700"
							htmlFor="login-email"
						>
							Email
						</label>
						<Input
							{...register('email')}
							id="login-email"
							required
							placeholder="name@company.com"
							type="email"
						/>
						{errors.email?.message ? (
							<p className="text-sm text-danger-500">{errors.email?.message}</p>
						) : null}
					</div>
					<div className="space-y-1">
						<label
							className="text-sm font-medium text-foreground-700"
							htmlFor="login-password"
						>
							Password
						</label>
						<Input
							{...register('password')}
							id="login-password"
							required
							type="password"
							placeholder="••••••••"
						/>
						{errors.password?.message ? (
							<p className="text-sm text-danger-500">
								{errors.password?.message}
							</p>
						) : null}
					</div>
					{errorMessage ? (
						<div className="text-sm text-danger-500">{errorMessage}</div>
					) : null}
					<Button
						type="submit"
						variant="primary"
						isDisabled={isSubmitting}
						className="w-full"
					>
						{isSubmitting ? <Spinner size="sm" /> : null}
						Sign in
					</Button>
				</form>
			)}
		</div>
	);
};

const LoginErrorBoundary = ({ error }: { error: unknown }) => {
	const routeStatus = getFailureStatus(error);

	if (routeStatus === 401) {
		return (
			<AppErrorView
				icon={<LockKeyhole aria-hidden="true" className="size-7" />}
				code="401 — Unauthorized"
				title="Authentication required"
				description="Your login request could not be authorized. Please verify your credentials and try again."
				testId="auth-401-view"
				actions={
					<Button
						variant="primary"
						onPress={() => {
							window.location.assign('/login');
						}}
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
		return <View404 />;
	}

	return (
		<AppErrorView
			icon={<AlertCircle aria-hidden="true" className="size-7" />}
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
