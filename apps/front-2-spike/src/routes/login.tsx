import { Button, Input, Spinner } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { View403 } from '~/components/View403';
import { getFailureMessage, toApiFailure } from '~/lib/api-failure';
import { completeLoginRedirect, login } from '~/server/session-actions';

type LoginFormValues = {
	email: string;
	password: string;
};

export const Route = createFileRoute('/login')({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const loginAction = useServerFn(login);
	const completeRedirectAction = useServerFn(completeLoginRedirect);

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

	const [errorMessage, setErrorMessage] = useState<string>('');
	const [isForbidden, setIsForbidden] = useState(false);

	const onSubmit: SubmitHandler<LoginFormValues> = async ({
		email,
		password,
	}) => {
		try {
			setErrorMessage('');
			const { sessionExpiresAt } = await loginAction({
				data: { email, password },
			});
			const redirect = await completeRedirectAction({
				data: { sessionExpiresAt },
			});
			const next = redirect?.targetPath ?? '/';
			await navigate({ to: next });
		} catch (error) {
			const failure = toApiFailure(error);

			if (failure.kind === 'problem' && failure.status === 403) {
				setIsForbidden(true);
				return;
			}

			const message = getFailureMessage(failure, {
				fallback: 'Login failed. Please check your credentials.',
			});
			setError('email', { message });
			setErrorMessage(message);
		}
	};

	if (isForbidden) {
		return <View403 />;
	}

	return (
		<div className="mx-auto max-w-md p-4">
			<h1 className="text-2xl font-semibold mb-4">Sign in</h1>
			<form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
				<Input
					placeholder="Email"
					type="email"
					{...register('email', {
						required: true,
					})}
					variant="primary"
					required
				/>
				<Input
					placeholder="Password"
					type="password"
					{...register('password', {
						required: true,
					})}
					variant="primary"
					required
				/>
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
		</div>
	);
}
