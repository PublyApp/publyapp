import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, type Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import * as cookie from 'cookie';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import {
	redirect,
	useFetcher,
	useLocation,
	useSearchParams,
} from 'react-router';
import { serializeError } from 'serialize-error';
import type { z } from 'zod';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
	queryParamKey,
	REDIRECT_CODE,
	SESSION_TOKEN_COOKIE_KEY,
	SESSION_TOKEN_HEADER_KEY,
} from '@org/shared-ts/lib/constants';
import duration from '@org/shared-ts/utils/duration.utils';
import { getSerializedErrorMessage } from '@org/shared-ts/utils/error.utils';
import { getAcceptInvitationSchema } from '@org/shared-ts/validations/invitation.validations';
import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	isSecureCookieFromRequest,
	readTenantHintsFromRequestHeaders,
	serializeTenantHintsForResponse,
	setTenantHintForUser,
} from '@/front/lib/cookies';
import { formatSessionCookie } from '@/front/lib/cookies/session-cookie.utils';
import { env } from '@/front/lib/env';
import { getClientManager } from '@/front/lib/js-client/client-manager';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import { interZodClient } from '@/front/lib/zod/zod.client';

import type { Route } from './+types/accept-invitation-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('accept-invitation'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [{ title: getPageTitle(t, true) }];
};

type AcceptInvitationForm = z.infer<
	ReturnType<typeof getAcceptInvitationSchema>
>;

export type InvitationLoaderResult = Awaited<ReturnType<typeof loader>>;

export const loader = getServerLoader({
	loader: async ({ request, z, context, sessionToken }) => {
		const apiClient = getClientManager().createClient({ skipAuth: true });
		const searchParams = new URL(request.url).searchParams;
		const encodedEmail = searchParams.get(
			queryParamKey.accept_invitation_page.encoded_email,
		);
		const token = searchParams.get(queryParamKey.accept_invitation_page.token);

		const t = z.t;
		const meta = [{ title: getPageTitle(t, true) }];

		if (!encodedEmail && !token) {
			return {
				code: 'NO_TOKEN_AND_ID',
				meta,
			} as const;
		}

		if (!token || !encodedEmail) {
			return {
				code: 'INVALID_LINK',
				meta,
			} as const;
		}

		const checkInvitationToken = safeRun(async () => {
			return apiClient.invitations.check.get({
				queryParameters: {
					id: encodedEmail,
					token: token,
				},
			});
		});

		const checkResult = await checkInvitationToken();

		if (checkResult.status === 'error') {
			context.logger.error('checkInvitationToken error', {
				error: serializeError(checkResult.error),
			});

			return {
				code: 'INVALID_LINK',
				meta,
			} as const;
		}

		const invitationCheckData = checkResult.data as
			| (typeof checkResult.data & { userExists?: boolean })
			| undefined;

		const getInvitationDetails = safeRun(async () => {
			return apiClient.invitations.byToken(token).details.get();
		});

		const result = await getInvitationDetails();

		if (result.status === 'error') {
			context.logger.error('getInvitationDetails error', {
				error: serializeError(result.error),
			});

			return {
				code: 'INVALID_LINK',
				meta,
			} as const;
		}

		return {
			code: 'VALID',
			invitationData: result.data,
			userExists: invitationCheckData?.userExists ?? false,
			isAuthenticated: Boolean(sessionToken),
			meta,
		} as const;
	},
});

export type AcceptInvitationActionResult = Awaited<ReturnType<typeof action>>;

export const action = getServerAction({
	action: async ({ request, context, sessionToken }) => {
		const apiClient = getClientManager().createClient({ skipAuth: true });
		const formData = await request.formData();

		const token = formData.get('token') as string;
		const acceptMode = formData.get('acceptMode') as string;
		const firstName = formData.get('firstName') as string;
		const lastName = formData.get('lastName') as string;
		const password = formData.get('password') as string;

		if (!token) {
			return {
				status: 'error',
				error: serializeError(new Error('No invitation token provided')),
			} as const;
		}

		if (acceptMode === 'existing-user') {
			if (!sessionToken) {
				return {
					status: 'error',
					error: serializeError(
						new Error('You must be signed in to accept this invitation'),
					),
				} as const;
			}

			const response = await fetch(
				`${env.VITE_ASP_SERVER_URL}/invitations/${encodeURIComponent(token)}/accept`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						[SESSION_TOKEN_HEADER_KEY]: sessionToken,
					},
					body: JSON.stringify({
						useExistingAccount: true,
					}),
				},
			);

			if (!response.ok) {
				const errorBody = (await response.json().catch(() => null)) as {
					detail?: string;
					title?: string;
				} | null;

				context.logger.error('acceptInvitation existing-user error', {
					status: response.status,
					error: errorBody,
				});

				return {
					status: 'error',
					error: serializeError(
						new Error(
							errorBody?.detail ||
								errorBody?.title ||
								'Failed to accept invitation',
						),
					),
				} as const;
			}

			const result = (await response.json()) as {
				userId?: string;
				tenantId?: string;
			};
			const tenantId = result.tenantId;
			const userId = result.userId;
			const responseHeaders = new Headers();

			if (tenantId && userId) {
				const { map: hintsMap } = readTenantHintsFromRequestHeaders(request);
				const updatedMap = setTenantHintForUser(hintsMap, userId, tenantId);
				const isSecure = isSecureCookieFromRequest(request);
				const mappingCookie = serializeTenantHintsForResponse(
					updatedMap,
					isSecure,
				);
				responseHeaders.append('Set-Cookie', mappingCookie);
			}

			return redirect(
				tenantId
					? FRONT_PATH_NAMES.tenant(tenantId).root
					: FRONT_PATH_NAMES.tenant()._root,
				{ headers: responseHeaders },
			) as never;
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
			context.logger.error('acceptInvitation error', {
				error: serializeError(result.error),
			});

			return {
				status: 'error',
				error: serializeError(result.error),
			} as const;
		}

		// Create authenticated session
		const responseHeaders = new Headers();
		const newSessionToken = result.data?.sessionToken || '';

		const sessionExpiry = dayjs().add(7, 'days').toDate();

		const cookieOptions = {
			expires: sessionExpiry,
			maxAge: duration.toSeconds('7d'),
		};

		// Determine where to send the user and encode cookie in dual-token format.
		// Note: We pass the token as tenantToken for legacy compatibility; ClientManager's
		// staff context already falls back to tenantToken for legacy cookies.
		const authedApiClient = getClientManager({
			tenantToken: newSessionToken,
		}).createClient();

		const getRedirectCode = safeRun(async () => {
			return authedApiClient.auth.redirectCode.get();
		});

		const redirectCodeResult = await getRedirectCode();
		const redirectCode =
			redirectCodeResult.status === 'success'
				? redirectCodeResult.data?.redirectCode
				: undefined;

		const sessionCookieValue =
			redirectCode === REDIRECT_CODE.STAFF
				? formatSessionCookie({ staffToken: newSessionToken })
				: formatSessionCookie({ tenantToken: newSessionToken });

		const sessionTokenCookie = cookie.serialize(
			SESSION_TOKEN_COOKIE_KEY,
			sessionCookieValue,
			cookieOptions,
		);
		responseHeaders.append('Set-Cookie', sessionTokenCookie);

		const redirectPath =
			redirectCode === REDIRECT_CODE.STAFF
				? FRONT_PATH_NAMES.staff.root
				: FRONT_PATH_NAMES.tenant()._root;

		return redirect(redirectPath, { headers: responseHeaders }) as never;
	},
});

const boxStyles = (theme: Theme) => {
	return {
		[theme.breakpoints.up('md')]: {
			mt: `-${theme.typography.pxToRem(300)}`,
		},
	};
};

const InvalidInvitationView = () => {
	const { t } = useTranslate();

	return (
		<Box>
			<Typography variant="h4" color="text.primary" sx={{ mb: 2 }}>
				{t('auth-invitation-invalid')}
			</Typography>
			<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
				{t('auth-invitation-invalid-description')}
			</Typography>
			<Button
				component={RouterLink}
				href={FRONT_PATH_NAMES.auth.login}
				variant="text"
				color="primary"
				endIcon={<Iconify icon="eva:arrow-forward-fill" />}
			>
				{t('auth-back-to-login')}
			</Button>
		</Box>
	);
};

const AcceptInvitationPage = ({ loaderData }: Route.ComponentProps) => {
	if (
		loaderData.code === 'INVALID_LINK' ||
		loaderData.code === 'NO_TOKEN_AND_ID'
	) {
		return (
			<Box sx={boxStyles}>
				<InvalidInvitationView />
			</Box>
		);
	}

	return (
		// * No boxStyles here because the top card will be pushed up and break
		<Box>
			<AcceptInvitationForm loaderData={loaderData} />
		</Box>
	);
};

export default AcceptInvitationPage;

const AcceptInvitationForm = ({
	loaderData,
}: {
	loaderData: Awaited<ReturnType<typeof loader>>;
}) => {
	const [searchParams] = useSearchParams();
	const location = useLocation();
	const token = searchParams.get(queryParamKey.token);
	const { t, i18n } = useTranslate();

	const schema = getAcceptInvitationSchema(interZodClient);

	const form = useForm<AcceptInvitationForm>({
		resolver: zodResolver(schema),
		defaultValues: {
			firstName: undefined,
			lastName: '',
			password: '',
			confirmPassword: '',
		},
	});

	const {
		formState: { isSubmitting },
	} = form;

	useSyncFormToLang(i18n.language, form);

	const fetcher = useFetcher<typeof action>();

	const errorMessage = getSerializedErrorMessage(fetcher.data?.error, t);

	const handleSubmit = form.handleSubmit(async (data) => {
		// Guard against multiple submissions while fetcher is already processing
		if (fetcher.state === 'submitting' || fetcher.state === 'loading') {
			return;
		}

		await fetcher.submit(
			{
				...data,
				token: token || '',
			},
			{
				method: 'post',
			},
		);
	});

	const handleAcceptWithExistingAccount = async () => {
		if (!token) {
			return;
		}

		if (fetcher.state === 'submitting' || fetcher.state === 'loading') {
			return;
		}

		await fetcher.submit(
			{
				token,
				acceptMode: 'existing-user',
			},
			{
				method: 'post',
			},
		);
	};

	if (loaderData.code !== 'VALID' || !loaderData.invitationData) {
		return null;
	}

	const invitationData = loaderData.invitationData;
	const loginHref = `${FRONT_PATH_NAMES.auth.login}?${new URLSearchParams({
		[queryParamKey.login_page.redirect_to]:
			`${location.pathname}${location.search}`,
	}).toString()}`;

	return (
		<>
			{!!errorMessage && (
				<Alert severity="error" sx={{ mb: 3 }}>
					{errorMessage}
				</Alert>
			)}

			{/* Invitation Details Card */}
			<Card
				variant="outlined"
				sx={{
					mb: 3,
					bgcolor: 'background.paper',
					borderColor: 'divider',
				}}
			>
				<CardContent>
					<Stack spacing={2}>
						<Box>
							<Typography
								variant="subtitle2"
								color="text.secondary"
								sx={{ mb: 0.5 }}
							>
								{t('email-address')}
							</Typography>
							<Typography variant="body1" sx={{ fontWeight: 500 }}>
								{invitationData.email}
							</Typography>
						</Box>
						<Divider />
						<Box>
							<Typography
								variant="subtitle2"
								color="text.secondary"
								sx={{ mb: 0.5 }}
							>
								{t('profile')}
							</Typography>
							<Typography variant="body1" sx={{ fontWeight: 500 }}>
								{invitationData.profileName}
							</Typography>
						</Box>
					</Stack>
				</CardContent>
			</Card>

			{loaderData.userExists ? (
				<Box>
					<Typography variant="h5" color="text.primary" sx={{ mb: 1 }}>
						{t('auth-accept-invitation')}
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
						{loaderData.isAuthenticated
							? 'This email already has an account. Join this organization with your current account.'
							: 'This email already has an account. Sign in first, then continue with this invitation.'}
					</Typography>
					{loaderData.isAuthenticated ? (
						<Button
							fullWidth
							size="large"
							variant="contained"
							onClick={handleAcceptWithExistingAccount}
							loading={
								fetcher.state === 'submitting' || fetcher.state === 'loading'
							}
						>
							Join organization
						</Button>
					) : (
						<Button
							fullWidth
							size="large"
							variant="contained"
							component={RouterLink}
							href={loginHref}
						>
							{t('sign-in')}
						</Button>
					)}
				</Box>
			) : (
				<Form methods={form} onSubmit={handleSubmit}>
					<Typography variant="h5" color="text.primary" sx={{ mb: 1 }}>
						{t('auth-accept-invitation')}
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
						{t('auth-accept-invitation-description', {
							email: invitationData.email,
							role: invitationData.profileName,
						})}
					</Typography>
					<Stack spacing={2.5}>
						<Field.Text
							name="firstName"
							label={t('firstname')}
							slotProps={{ inputLabel: { shrink: true } }}
						/>
						<Field.Text
							name="lastName"
							label={t('lastname')}
							slotProps={{ inputLabel: { shrink: true } }}
							required
						/>
						<Field.Text
							name="password"
							label={t('password')}
							type="password"
							slotProps={{ inputLabel: { shrink: true } }}
							required
						/>
						<Field.Text
							name="confirmPassword"
							label={t('confirm-password')}
							type="password"
							slotProps={{ inputLabel: { shrink: true } }}
							required
						/>
					</Stack>
					<Button
						fullWidth
						size="large"
						type="submit"
						variant="contained"
						sx={{ mt: 3 }}
						loading={
							isSubmitting ||
							fetcher.state === 'submitting' ||
							fetcher.state === 'loading'
						}
					>
						{t('create-account')}
					</Button>
				</Form>
			)}
		</>
	);
};
