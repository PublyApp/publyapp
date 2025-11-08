import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { APP_NAME } from '@org/shared/lib/constants';
import * as cookie from 'cookie';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data, redirect, useNavigate, useParams } from 'react-router';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
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
			<Box
				sx={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Card sx={{ width: '100%', maxWidth: 500 }}>
					<CardHeader
						title={t('auth-invitation-invalid')}
						subheader={t('auth-invitation-invalid-description')}
					/>
					<CardContent>
						<Button
							variant="contained"
							onClick={() => navigate(FRONT_PATH_NAMES.auth.login)}
						>
							{t('auth-back-to-login')}
						</Button>
					</CardContent>
				</Card>
			</Box>
		);
	}

	const invitationData = loaderData.invitationData;

	return (
		<Box
			sx={{
				minHeight: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				p: 2,
			}}
		>
			<Card sx={{ width: '100%', maxWidth: 500 }}>
				<CardHeader
					title={t('auth-accept-invitation')}
					subheader={t('auth-accept-invitation-description', {
						email: invitationData.email,
						role: invitationData.profileName,
					})}
				/>
				<CardContent>
					<Box component="form" onSubmit={handleSubmit(onSubmit)}>
						<Stack spacing={3}>
							<TextField
								id="firstName"
								label={t('auth-first-name')}
								fullWidth
								{...register('firstName')}
								disabled={isSubmitting}
								error={!!errors.firstName}
								helperText={errors.firstName?.message}
							/>

							<TextField
								id="lastName"
								label={t('auth-last-name')}
								fullWidth
								{...register('lastName')}
								disabled={isSubmitting}
								error={!!errors.lastName}
								helperText={errors.lastName?.message}
							/>

							<TextField
								id="password"
								label={t('password')}
								type="password"
								fullWidth
								{...register('password')}
								disabled={isSubmitting}
								error={!!errors.password}
								helperText={errors.password?.message}
							/>

							<TextField
								id="confirmPassword"
								label={t('confirm-password')}
								type="password"
								fullWidth
								{...register('confirmPassword')}
								disabled={isSubmitting}
								error={!!errors.confirmPassword}
								helperText={errors.confirmPassword?.message}
							/>

							<Button
								type="submit"
								variant="contained"
								fullWidth
								disabled={isSubmitting}
							>
								{isSubmitting ? t('common-loading') : t('create-account')}
							</Button>
						</Stack>
					</Box>
				</CardContent>
			</Card>
		</Box>
	);
};

export default AcceptInvitationPage;
