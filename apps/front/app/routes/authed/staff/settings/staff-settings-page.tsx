import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo, useState } from 'react';
import { data } from 'react-router';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify } from '@/front/components/iconify/iconify';
import type { IconifyName } from '@/front/components/iconify/register-icons';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import type { Route } from './+types/staff-settings-page';

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('settings'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
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

type SettingsTabValue = 'general' | 'email' | 'security';

type SettingsTabConfig = {
	value: SettingsTabValue;
	label: string;
	icon: IconifyName;
};

// ----------------------------------------------------------------------

const StaffSettingsPage = () => {
	const { t } = useTranslate();
	const [currentTab, setCurrentTab] = useState<SettingsTabValue>('general');

	const SETTINGS_TABS: SettingsTabConfig[] = useMemo(
		() => [
			{
				value: 'general',
				label: _.capitalize(t('general')),
				icon: 'solar:settings-bold',
			},
			{
				value: 'email',
				label: _.capitalize(t('email')),
				icon: 'solar:letter-bold',
			},
			{
				value: 'security',
				label: _.capitalize(t('security')),
				icon: 'solar:shield-check-bold',
			},
		],
		[t],
	);

	const handleTabChange = (
		_event: React.SyntheticEvent,
		newValue: SettingsTabValue,
	) => {
		setCurrentTab(newValue);
	};

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
						name: _.capitalize(t('staff')),
						href: FRONT_PATH_NAMES.staff.root,
					},
					{ name: _.capitalize(t('settings')) },
				]}
				sx={{ mb: 3 }}
			/>

			<Tabs
				value={currentTab}
				onChange={handleTabChange}
				sx={{ mb: { xs: 3, md: 5 } }}
			>
				{SETTINGS_TABS.map((tab) => (
					<Tab
						key={tab.value}
						label={tab.label}
						icon={<Iconify width={24} icon={tab.icon} />}
						value={tab.value}
					/>
				))}
			</Tabs>

			{currentTab === 'general' && <GeneralSettingsSection />}
			{currentTab === 'email' && <EmailSettingsSection />}
			{currentTab === 'security' && <SecuritySettingsSection />}
		</DashboardContent>
	);
};

export default StaffSettingsPage;

// ----------------------------------------------------------------------

const GeneralSettingsSection = () => {
	const { t } = useTranslate();

	return (
		<Card>
			<CardContent>
				<Typography variant="h6" sx={{ mb: 3 }}>
					{_.capitalize(t('general-settings'))}
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						gap: 2,
					}}
				>
					<Box>
						<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
							{t('app-name')}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{APP_NAME}
						</Typography>
					</Box>

					<Box>
						<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
							{t('logo')}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{t('coming-soon')}
						</Typography>
					</Box>
				</Box>
			</CardContent>
		</Card>
	);
};

// ----------------------------------------------------------------------

const EmailSettingsSection = () => {
	const { t } = useTranslate();

	return (
		<Card>
			<CardContent>
				<Typography variant="h6" sx={{ mb: 3 }}>
					{_.capitalize(t('email-settings'))}
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						py: 6,
					}}
				>
					<Iconify
						icon="solar:letter-bold"
						width={64}
						sx={{ color: 'text.disabled', mb: 2 }}
					/>
					<Typography variant="h6" sx={{ mb: 1 }}>
						{t('smtp-configuration')}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						{t('coming-soon')}
					</Typography>
				</Box>
			</CardContent>
		</Card>
	);
};

// ----------------------------------------------------------------------

const SecuritySettingsSection = () => {
	const { t } = useTranslate();

	return (
		<Card>
			<CardContent>
				<Typography variant="h6" sx={{ mb: 3 }}>
					{_.capitalize(t('security-settings'))}
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
					}}
				>
					<Box
						sx={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							py: 4,
							borderRadius: 1,
							bgcolor: 'background.neutral',
						}}
					>
						<Iconify
							icon="solar:clock-circle-bold"
							width={48}
							sx={{ color: 'text.disabled', mb: 2 }}
						/>
						<Typography variant="subtitle1" sx={{ mb: 0.5 }}>
							{t('session-timeout')}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{t('coming-soon')}
						</Typography>
					</Box>

					<Box
						sx={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							py: 4,
							borderRadius: 1,
							bgcolor: 'background.neutral',
						}}
					>
						<Iconify
							icon="solar:shield-check-bold"
							width={48}
							sx={{ color: 'text.disabled', mb: 2 }}
						/>
						<Typography variant="subtitle1" sx={{ mb: 0.5 }}>
							{t('two-factor-authentication')}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{t('coming-soon')}
						</Typography>
					</Box>
				</Box>
			</CardContent>
		</Card>
	);
};
