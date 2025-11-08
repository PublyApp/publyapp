import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import Card from '@mui/material/card';
import CardContent from '@mui/material/card';
import CardDescription from '@mui/material/card';
import CardHeader from '@mui/material/card';
import CardTitle from '@mui/material/card';
import Input from '@mui/material/input';
import { APP_NAME } from '@org/shared/lib/constants';
import * as cookie from 'cookie';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data, redirect, useNavigate, useParams } from 'react-router';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
import { Label } from '@/front/components/label/label';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import {
	FRONT_PATH_NAMES,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import duration from '@/shared/utils/duration.utils';
import type { Route } from './+types/accept-invitation-page';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: `Accept Invitation - ${APP_NAME}` }];
};

const acceptInvitationSchema = z
	.object({
		firstName: z.string().min(1, 'First name is required').max(100),
		lastName: z.string().min(1, 'Last name is required').max(100),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(255),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ['confirmPassword'],
	});

type AcceptInvitationForm = z.infer<typeof acceptInvitationSchema>;

export type InvitationLoaderResult = Awaited<ReturnType<typeof loader>>['data'];

export const loader = getServerLoader({
	loader: async ({ params, apiClient }) => {
		const token = params.token;

		if (!token) {
			return data(
				{ error: 'No invitation token provided', invitationData: null },
				{ status: 400 },
			);
		}

		const getInvitationDetails = safeRun(async () => {
			return apiClient.invitations.byToken(token).details.get();
		});

		const result = await getInvitationDetails();

		if (result.status === 'error') {
			return data(
				{ error: serializeError(result.error), invitationData: null },
				{ status: 400 },
			);
		}

		return data({ error: null, invitationData: result.data });
	},
});

export type AcceptInvitationActionResult = Awaited<
	ReturnType<typeof action>
>['data'];

export const action = getServerAction({
	action: async ({ request, apiClient }) => {
		const formData = await request.formData();

		const token = formData.get('token') as string;
		const firstName = formData.get('firstName') as string;
		const lastName = formData.get('lastName') as string;
		const password = formData.get('password') as string;

		if (!token) {
			return data({ error: 'No invitation token provided' }, { status: 400 });
		}

		const acceptInvitation = safeRun(async () => {
			return apiClient.invitations.byToken(token).accept.post({
				firstName: {
					getValue: () => {
						return firstName;
					},
				},
				lastName: {
					getValue: () => {
						return lastName;
					},
				},
				password: {
					getValue: () => {
						return password;
					},
				},
			});
		});

		const result = await acceptInvitation();

		if (result.status === 'error') {
			return data({ error: serializeError(result.error) });
		}

		// Create authenticated session
		const responseHeaders = new Headers();
		const sessionToken = result.data?.sessionToken || '';

		const sessionExpiry = dayjs().add(7, 'days').toDate();

		const cookieOptions = {
			expires: sessionExpiry,
			maxAge: duration.toSeconds('7d'),
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax' as const,
		};

		const sessionTokenCookie = cookie.serialize(
			SESSION_TOKEN_COOKIE_KEY,
			sessionToken,
			cookieOptions,
		);
		responseHeaders.append('Set-Cookie', sessionTokenCookie);

		// Redirect to staff dashboard
		return redirect(FRONT_PATH_NAMES.staff.root, {
			headers: responseHeaders,
		}) as never;
	},
});

const AcceptInvitationPage = ({
	loaderData,
	actionData,
}: Route.ComponentProps) => {
	const { token } = useParams<{ token: string }>();
	const navigate = useNavigate();
	const { t } = useTranslate();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<AcceptInvitationForm>({
		resolver: zodResolver(acceptInvitationSchema),
	});

	useEffect(() => {
		if (actionData?.error) {
			toast.error(t('auth-invitation-error') || 'Failed to accept invitation');
			setIsSubmitting(false);
		}
	}, [actionData, t]);

	const onSubmit = async (data: AcceptInvitationForm) => {
		setIsSubmitting(true);
		const formData = new FormData();
		formData.append('token', token || '');
		formData.append('firstName', data.firstName);
		formData.append('lastName', data.lastName);
		formData.append('password', data.password);

		// Submit form
		const form = document.createElement('form');
		form.method = 'POST';
		form.style.display = 'none';
		for (const [key, value] of formData.entries()) {
			const input = document.createElement('input');
			input.name = key;
			input.value = value as string;
			form.appendChild(input);
		}
		document.body.appendChild(form);
		form.submit();
	};

	if (loaderData?.error || !loaderData?.invitationData) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>{t('auth-invitation-invalid')}</CardTitle>
						<CardDescription>
							{t('auth-invitation-invalid-description')}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => navigate(FRONT_PATH_NAMES.auth.login)}>
							{t('auth-back-to-login')}
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const invitationData = loaderData.invitationData;

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t('auth-accept-invitation')}</CardTitle>
					<CardDescription>
						{t('auth-accept-invitation-description', {
							email: invitationData.email,
							role: invitationData.profileName,
						})}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="firstName">{t('auth-first-name')}</Label>
							<Input
								id="firstName"
								{...register('firstName')}
								disabled={isSubmitting}
							/>
							{errors.firstName && (
								<p className="text-sm text-red-500">
									{errors.firstName.message}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="lastName">{t('auth-last-name')}</Label>
							<Input
								id="lastName"
								{...register('lastName')}
								disabled={isSubmitting}
							/>
							{errors.lastName && (
								<p className="text-sm text-red-500">
									{errors.lastName.message}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">{t('password')}</Label>
							<Input
								id="password"
								type="password"
								{...register('password')}
								disabled={isSubmitting}
							/>
							{errors.password && (
								<p className="text-sm text-red-500">
									{errors.password.message}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="confirmPassword">{t('confirm-password')}</Label>
							<Input
								id="confirmPassword"
								type="password"
								{...register('confirmPassword')}
								disabled={isSubmitting}
							/>
							{errors.confirmPassword && (
								<p className="text-sm text-red-500">
									{errors.confirmPassword.message}
								</p>
							)}
						</div>

						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? t('common-loading') : t('create-account')}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};

export default AcceptInvitationPage;
