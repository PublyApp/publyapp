import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { data } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/user-notifications-page';

// ----------------------------------------------------------------------

type NotificationFormValues = {
	emailMarketing: boolean;
	emailProductUpdates: boolean;
	emailSecurityAlerts: boolean;
	pushNewMessages: boolean;
	pushMentions: boolean;
	pushComments: boolean;
	activityWeeklyDigest: boolean;
	activityMonthlyReport: boolean;
};

type NotificationItem = {
	id: keyof NotificationFormValues;
	label: string;
	disabled?: boolean;
};

type NotificationSection = {
	subheader: string;
	caption: string;
	items: NotificationItem[];
};

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('notifications'));

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

// ----------------------------------------------------------------------

const UserNotificationsPage = () => {
	const { t } = useTranslate();

	const defaultValues: NotificationFormValues = {
		emailMarketing: false,
		emailProductUpdates: true,
		emailSecurityAlerts: true,
		pushNewMessages: true,
		pushMentions: true,
		pushComments: false,
		activityWeeklyDigest: true,
		activityMonthlyReport: false,
	};

	const { control, handleSubmit, formState } = useForm<NotificationFormValues>({
		defaultValues,
	});

	const { isSubmitting } = formState;

	const NOTIFICATION_SECTIONS: NotificationSection[] = useMemo(
		() => [
			{
				subheader: _.capitalize(t('email-notifications')),
				caption: t('manage-your-email-notification-preferences'),
				items: [
					{
						id: 'emailMarketing',
						label: t('marketing-emails'),
					},
					{
						id: 'emailProductUpdates',
						label: t('product-updates'),
					},
					{
						id: 'emailSecurityAlerts',
						label: t('security-alerts'),
						disabled: true,
					},
				],
			},
			{
				subheader: _.capitalize(t('push-notifications')),
				caption: t('manage-your-push-notification-preferences'),
				items: [
					{
						id: 'pushNewMessages',
						label: t('new-messages'),
					},
					{
						id: 'pushMentions',
						label: t('mentions'),
					},
					{
						id: 'pushComments',
						label: t('comments'),
					},
				],
			},
			{
				subheader: _.capitalize(t('activity')),
				caption: t('manage-your-activity-digest-preferences'),
				items: [
					{
						id: 'activityWeeklyDigest',
						label: t('weekly-digest'),
					},
					{
						id: 'activityMonthlyReport',
						label: t('monthly-report'),
					},
				],
			},
		],
		[t],
	);

	const onSubmit = handleSubmit(async (formData) => {
		try {
			// Simulate API call
			await new Promise((resolve) => setTimeout(resolve, 500));
			toast.success(t('notification-settings-saved'));
			console.info('Notification settings:', formData);
		} catch (error) {
			console.error(error);
			toast.error(t('failed-to-save-notification-settings'));
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
					{ name: _.capitalize(t('notifications')) },
				]}
				sx={{ mb: 3 }}
			/>

			<form onSubmit={onSubmit}>
				<Card
					sx={{
						p: 3,
						gap: 3,
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					{NOTIFICATION_SECTIONS.map((section) => (
						<Grid key={section.subheader} container spacing={3}>
							<Grid size={{ xs: 12, md: 4 }}>
								<ListItemText
									primary={section.subheader}
									secondary={section.caption}
									slotProps={{
										primary: { sx: { typography: 'h6' } },
										secondary: { sx: { mt: 0.5 } },
									}}
								/>
							</Grid>

							<Grid size={{ xs: 12, md: 8 }}>
								<Box
									sx={{
										p: 3,
										gap: 1,
										borderRadius: 2,
										display: 'flex',
										flexDirection: 'column',
										bgcolor: 'background.neutral',
									}}
								>
									{section.items.map((item) => (
										<Controller
											key={item.id}
											name={item.id}
											control={control}
											render={({ field }) => (
												<FormControlLabel
													label={item.label}
													labelPlacement="start"
													disabled={item.disabled}
													control={
														<Switch
															checked={item.disabled ? true : field.value}
															onChange={field.onChange}
															disabled={item.disabled}
															slotProps={{
																input: {
																	id: `${item.id}-switch`,
																	'aria-label': `${item.label} switch`,
																},
															}}
														/>
													}
													sx={{
														m: 0,
														width: 1,
														justifyContent: 'space-between',
													}}
												/>
											)}
										/>
									))}
								</Box>
							</Grid>
						</Grid>
					))}

					<Button
						type="submit"
						variant="contained"
						loading={isSubmitting}
						sx={{ ml: 'auto' }}
					>
						{_.capitalize(t('save-changes'))}
					</Button>
				</Card>
			</form>
		</DashboardContent>
	);
};

export default UserNotificationsPage;
