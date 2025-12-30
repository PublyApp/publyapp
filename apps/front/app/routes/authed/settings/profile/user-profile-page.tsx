import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import { z as zod } from 'zod';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Field, Form, schemaHelper } from '@/front/components/hook-form';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { fData } from '@/front/utils/format-number';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

import type { Route } from './+types/user-profile-page';

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('profile'));

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

export type UserProfileFormData = zod.infer<typeof UserProfileSchema>;

export const UserProfileSchema = zod.object({
	firstName: zod.string().min(1, { message: 'First name is required!' }),
	lastName: zod.string().min(1, { message: 'Last name is required!' }),
	email: zod
		.string()
		.min(1, { message: 'Email is required!' })
		.email({ message: 'Email must be a valid email address!' }),
	phoneNumber: zod.string().optional().or(zod.literal('')),
	avatarUrl: schemaHelper
		.file({ message: 'Avatar is required!' })
		.nullable()
		.optional(),
});

// ----------------------------------------------------------------------

// Mock user data - to be replaced with actual API data later
const mockCurrentUser: UserProfileFormData = {
	firstName: 'John',
	lastName: 'Doe',
	email: 'john.doe@example.com',
	phoneNumber: '+1 234 567 8900',
	avatarUrl: null,
};

// ----------------------------------------------------------------------

const UserProfilePage = () => {
	const { t } = useTranslate();

	const defaultValues: UserProfileFormData = {
		firstName: '',
		lastName: '',
		email: '',
		phoneNumber: '',
		avatarUrl: null,
	};

	const methods = useForm<UserProfileFormData>({
		mode: 'all',
		resolver: zodResolver(UserProfileSchema),
		defaultValues,
		values: mockCurrentUser,
	});

	const {
		handleSubmit,
		formState: { isSubmitting },
	} = methods;

	const onSubmit = handleSubmit(async (formData) => {
		try {
			// Simulate API call
			await new Promise((resolve) => setTimeout(resolve, 500));
			toast.success('Profile updated successfully!');
			logger.info('Profile form data:', formData);
		} catch (error) {
			logger.error('Failed to update profile', error);
			toast.error('Failed to update profile');
		}
	});

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
					{ name: _.capitalize(t('profile')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Form methods={methods} onSubmit={onSubmit}>
				<Grid container spacing={3}>
					{/* Left Card - Avatar Upload */}
					<Grid size={{ xs: 12, md: 4 }}>
						<Card
							sx={{
								pt: 10,
								pb: 5,
								px: 3,
								textAlign: 'center',
							}}
						>
							<Field.UploadAvatar
								name="avatarUrl"
								maxSize={3145728}
								helperText={
									<Typography
										variant="caption"
										sx={{
											mt: 3,
											mx: 'auto',
											display: 'block',
											textAlign: 'center',
											color: 'text.disabled',
										}}
									>
										Allowed *.jpeg, *.jpg, *.png, *.gif
										<br /> max size of {fData(3145728)}
									</Typography>
								}
							/>
						</Card>
					</Grid>

					{/* Right Card - Form Fields */}
					<Grid size={{ xs: 12, md: 8 }}>
						<Card sx={{ p: 3 }}>
							<Box
								sx={{
									rowGap: 3,
									columnGap: 2,
									display: 'grid',
									gridTemplateColumns: {
										xs: 'repeat(1, 1fr)',
										sm: 'repeat(2, 1fr)',
									},
								}}
							>
								<Field.Text name="firstName" label="First Name" />
								<Field.Text name="lastName" label="Last Name" />
								<Field.Text
									name="email"
									label="Email Address"
									disabled
									helperText="Email cannot be changed"
								/>
								<Field.Phone
									name="phoneNumber"
									label="Phone Number"
									helperText="Optional"
								/>
							</Box>

							<Stack spacing={3} sx={{ mt: 3, alignItems: 'flex-end' }}>
								<Button
									type="submit"
									variant="contained"
									loading={isSubmitting}
								>
									Save Changes
								</Button>
							</Stack>
						</Card>
					</Grid>
				</Grid>
			</Form>
		</DashboardContent>
	);
};

export default UserProfilePage;
