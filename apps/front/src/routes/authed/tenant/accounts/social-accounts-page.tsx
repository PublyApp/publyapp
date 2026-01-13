import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify, type IconifyProps } from '@/front/components/iconify/iconify';
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

import type { Route } from './+types/social-accounts-page';

// ----------------------------------------------------------------------

type SocialPlatform = {
	id: string;
	name: string;
	icon: IconifyProps['icon'];
	brandColor: string;
	description: string;
	isConnected: boolean;
	connectedAccountName?: string;
};

const socialPlatforms: SocialPlatform[] = [
	{
		id: 'facebook',
		name: 'Facebook',
		icon: 'socials:facebook',
		brandColor: '#1877F2',
		description:
			'Connect your Facebook page to publish content and engage with your audience.',
		isConnected: false,
	},
	{
		id: 'twitter',
		name: 'Twitter / X',
		icon: 'socials:twitter',
		brandColor: '#000000',
		description:
			'Connect your Twitter account to share updates and interact with followers.',
		isConnected: false,
	},
	{
		id: 'instagram',
		name: 'Instagram',
		icon: 'socials:instagram',
		brandColor: '#E4405F',
		description:
			'Connect your Instagram business account to share visual content.',
		isConnected: false,
	},
	{
		id: 'linkedin',
		name: 'LinkedIn',
		icon: 'socials:linkedin',
		brandColor: '#0A66C2',
		description:
			'Connect your LinkedIn profile or company page for professional networking.',
		isConnected: false,
	},
];

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('social-accounts'));

	if (seo) {
		str = `${str} | Accounts - ${APP_NAME}`;
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

type SocialAccountCardProps = {
	platform: SocialPlatform;
	onConnect: (platformId: string) => void;
	onDisconnect: (platformId: string) => void;
};

const SocialAccountCard = ({
	platform,
	onConnect,
	onDisconnect,
}: SocialAccountCardProps) => {
	const { t } = useTranslate();

	const handleButtonClick = () => {
		if (platform.isConnected) {
			onDisconnect(platform.id);
		} else {
			onConnect(platform.id);
		}
	};

	return (
		<Card
			sx={{
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				transition: 'box-shadow 0.3s ease-in-out',
				'&:hover': {
					boxShadow: (theme) => theme.shadows[8],
				},
			}}
		>
			<CardContent
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					p: 3,
				}}
			>
				<Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
					<Avatar
						sx={{
							width: 56,
							height: 56,
							bgcolor: platform.brandColor,
							color: 'common.white',
						}}
					>
						<Iconify icon={platform.icon} width={28} />
					</Avatar>
					<Box sx={{ flexGrow: 1 }}>
						<Typography variant="h6" sx={{ fontWeight: 600 }}>
							{platform.name}
						</Typography>
						<Typography
							variant="body2"
							sx={{
								color: platform.isConnected ? 'success.main' : 'text.secondary',
								fontWeight: platform.isConnected ? 500 : 400,
							}}
						>
							{platform.isConnected
								? _.capitalize(t('connected'))
								: _.capitalize(t('not-connected'))}
						</Typography>
					</Box>
				</Stack>

				<Typography
					variant="body2"
					sx={{
						color: 'text.secondary',
						mb: 2,
						flexGrow: 1,
					}}
				>
					{platform.description}
				</Typography>

				{platform.isConnected && platform.connectedAccountName && (
					<Box
						sx={{
							mb: 2,
							p: 1.5,
							borderRadius: 1,
							bgcolor: 'action.hover',
						}}
					>
						<Typography variant="caption" sx={{ color: 'text.secondary' }}>
							{_.capitalize(t('connected-as'))}:
						</Typography>
						<Typography variant="body2" sx={{ fontWeight: 500 }}>
							{platform.connectedAccountName}
						</Typography>
					</Box>
				)}

				<Button
					variant={platform.isConnected ? 'outlined' : 'contained'}
					color={platform.isConnected ? 'error' : 'primary'}
					onClick={handleButtonClick}
					startIcon={
						<Iconify
							icon={
								platform.isConnected
									? 'solar:close-circle-bold'
									: 'solar:add-circle-bold'
							}
						/>
					}
					sx={{
						mt: 'auto',
						...(!platform.isConnected && {
							bgcolor: platform.brandColor,
							'&:hover': {
								bgcolor: platform.brandColor,
								filter: 'brightness(0.9)',
							},
						}),
					}}
				>
					{platform.isConnected
						? _.capitalize(t('disconnect'))
						: _.capitalize(t('connect'))}
				</Button>
			</CardContent>
		</Card>
	);
};

// ----------------------------------------------------------------------

const SocialAccountsPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	const handleConnect = (platformId: string) => {
		// TODO: Implement OAuth connection flow
		logger.info(`Connecting to platform: ${platformId}`);
	};

	const handleDisconnect = (platformId: string) => {
		// TODO: Implement disconnection logic
		logger.info(`Disconnecting from platform: ${platformId}`);
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
						name: _.capitalize(t('dashboard')),
						href: FRONT_PATH_NAMES.tenant(tenantId).root,
					},
					{
						name: _.capitalize(t('accounts')),
						href: FRONT_PATH_NAMES.tenant(tenantId).accounts.root,
					},
					{ name: _.capitalize(t('social-accounts')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Box sx={{ mb: 3 }}>
				<Typography variant="body1" sx={{ color: 'text.secondary' }}>
					{t('social-accounts-description') ||
						'Connect your social media accounts to publish content and manage your online presence from one place.'}
				</Typography>
			</Box>

			<Grid container spacing={3}>
				{socialPlatforms.map((platform) => (
					<Grid key={platform.id} size={{ xs: 12, sm: 6, md: 6, lg: 3 }}>
						<SocialAccountCard
							platform={platform}
							onConnect={handleConnect}
							onDisconnect={handleDisconnect}
						/>
					</Grid>
				))}
			</Grid>
		</DashboardContent>
	);
};

export default SocialAccountsPage;
