import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import { z as zod } from 'zod';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

import type { Route } from './+types/user-security-page';

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('security'));

	if (seo) {
		str = `${str} | Settings - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

export const clientLoader = async ({
	serverLoader,
}: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces([I18N_NAMESPACES.ZOD]).catch((error) => {
		logger.error('Failed to load namespaces', error);
	});
	const serverData = await serverLoader();
	return data(serverData);
};
clientLoader.hydrate = true as const;

// ----------------------------------------------------------------------

export type ChangePasswordFormData = zod.infer<typeof ChangePasswordSchema>;

export const ChangePasswordSchema = zod
	.object({
		currentPassword: zod
			.string()
			.min(1, { message: 'Current password is required!' })
			.min(6, { message: 'Password must be at least 6 characters!' }),
		newPassword: zod
			.string()
			.min(1, { message: 'New password is required!' })
			.min(6, { message: 'Password must be at least 6 characters!' }),
		confirmNewPassword: zod
			.string()
			.min(1, { message: 'Confirm password is required!' }),
	})
	.refine((formData) => formData.currentPassword !== formData.newPassword, {
		message: 'New password must be different from current password',
		path: ['newPassword'],
	})
	.refine((formData) => formData.newPassword === formData.confirmNewPassword, {
		message: 'Passwords do not match!',
		path: ['confirmNewPassword'],
	});

// ----------------------------------------------------------------------

const UserSecurityPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('settings')),
						href: FRONT_PATH_NAMES.settings.root,
					},
					{ name: _.capitalize(t('security')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Stack spacing={3}>
				<ChangePasswordCard />
				<TwoFactorAuthCard />
			</Stack>
		</DashboardContent>
	);
};

export default UserSecurityPage;

// ----------------------------------------------------------------------

const ChangePasswordCard = () => {
	const { t } = useTranslate();
	const showCurrentPassword = useBoolean();
	const showNewPassword = useBoolean();
	const showConfirmPassword = useBoolean();

	const defaultValues: ChangePasswordFormData = {
		currentPassword: '',
		newPassword: '',
		confirmNewPassword: '',
	};

	const methods = useForm<ChangePasswordFormData>({
		mode: 'all',
		resolver: zodResolver(ChangePasswordSchema),
		defaultValues,
	});

	const {
		reset,
		handleSubmit,
		formState: { isSubmitting },
	} = methods;

	const onSubmit = handleSubmit(async (formData) => {
		try {
			// Simulate API call - to be replaced with actual API call
			await new Promise((resolve) => setTimeout(resolve, 500));
			reset();
			toast.success(t('password-updated-successfully'));
			logger.info('Password change form data:', formData);
		} catch (error) {
			logger.error('Failed to update password', error);
			toast.error(t('failed-to-update-password'));
		}
	});

	return (
		<Card sx={{ p: 3 }}>
			<Typography variant="h6" sx={{ mb: 3 }}>
				{t('change-password')}
			</Typography>

			<Form methods={methods} onSubmit={onSubmit}>
				<Stack spacing={3}>
					<Field.Text
						name="currentPassword"
						label={t('current-password')}
						type={showCurrentPassword.value ? 'text' : 'password'}
						slotProps={{
							input: {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton
											onClick={showCurrentPassword.onToggle}
											edge="end"
										>
											<Iconify
												icon={
													showCurrentPassword.value
														? 'solar:eye-bold'
														: 'solar:eye-closed-bold'
												}
											/>
										</IconButton>
									</InputAdornment>
								),
							},
						}}
					/>

					<Field.Text
						name="newPassword"
						label={t('new-password')}
						type={showNewPassword.value ? 'text' : 'password'}
						slotProps={{
							input: {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton onClick={showNewPassword.onToggle} edge="end">
											<Iconify
												icon={
													showNewPassword.value
														? 'solar:eye-bold'
														: 'solar:eye-closed-bold'
												}
											/>
										</IconButton>
									</InputAdornment>
								),
							},
						}}
						helperText={
							<Box
								component="span"
								sx={{
									gap: 0.5,
									display: 'flex',
									alignItems: 'center',
								}}
							>
								<Iconify icon="solar:info-circle-bold" width={16} />
								{t('password-must-be-minimum-6-characters')}
							</Box>
						}
					/>

					<Field.Text
						name="confirmNewPassword"
						label={t('confirm-new-password')}
						type={showConfirmPassword.value ? 'text' : 'password'}
						slotProps={{
							input: {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton
											onClick={showConfirmPassword.onToggle}
											edge="end"
										>
											<Iconify
												icon={
													showConfirmPassword.value
														? 'solar:eye-bold'
														: 'solar:eye-closed-bold'
												}
											/>
										</IconButton>
									</InputAdornment>
								),
							},
						}}
					/>

					<Stack alignItems="flex-end">
						<Button type="submit" variant="contained" loading={isSubmitting}>
							{t('save-changes')}
						</Button>
					</Stack>
				</Stack>
			</Form>
		</Card>
	);
};

// ----------------------------------------------------------------------

const TwoFactorAuthCard = () => {
	const { t } = useTranslate();

	return (
		<Card sx={{ p: 3 }}>
			<Typography variant="h6" sx={{ mb: 3 }}>
				{t('two-factor-authentication')}
			</Typography>

			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					py: 6,
					borderRadius: 1,
					bgcolor: 'background.neutral',
				}}
			>
				<Iconify
					icon="solar:shield-check-bold"
					width={64}
					sx={{ color: 'text.disabled', mb: 2 }}
				/>
				<Typography variant="h6" sx={{ mb: 1 }}>
					{t('two-factor-authentication')}
				</Typography>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 2, textAlign: 'center', maxWidth: 400 }}
				>
					{t('two-factor-authentication-description')}
				</Typography>
				<Typography
					variant="caption"
					sx={{
						px: 2,
						py: 0.75,
						borderRadius: 1,
						bgcolor: 'action.selected',
						color: 'text.secondary',
					}}
				>
					{t('coming-soon')}
				</Typography>
			</Box>
		</Card>
	);
};
