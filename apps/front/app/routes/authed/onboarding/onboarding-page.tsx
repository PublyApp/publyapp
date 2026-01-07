import { zodResolver } from '@hookform/resolvers/zod';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data, useNavigate } from 'react-router';
import { z as zod } from 'zod';

import { Field, Form } from '@/front/components/hook-form';
import { Iconify, type IconifyProps } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { SimpleLayout } from '@/front/layouts/simple/layout';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

import type { Route } from './+types/onboarding-page';

// ----------------------------------------------------------------------

const STEPS = [
	'Welcome',
	'Create Organization',
	'Connect Accounts',
	'Complete',
];

const INDUSTRIES = [
	{ value: 'technology', label: 'Technology' },
	{ value: 'marketing', label: 'Marketing & Advertising' },
	{ value: 'ecommerce', label: 'E-commerce' },
	{ value: 'media', label: 'Media & Entertainment' },
	{ value: 'education', label: 'Education' },
	{ value: 'healthcare', label: 'Healthcare' },
	{ value: 'finance', label: 'Finance' },
	{ value: 'nonprofit', label: 'Non-profit' },
	{ value: 'other', label: 'Other' },
];

type SocialPlatform = {
	id: string;
	name: string;
	icon: IconifyProps['icon'];
	brandColor: string;
	description: string;
};

const SOCIAL_PLATFORMS: SocialPlatform[] = [
	{
		id: 'facebook',
		name: 'Facebook',
		icon: 'socials:facebook',
		brandColor: '#1877F2',
		description: 'Connect your Facebook page to publish content.',
	},
	{
		id: 'twitter',
		name: 'Twitter / X',
		icon: 'socials:twitter',
		brandColor: '#000000',
		description: 'Share updates on Twitter.',
	},
	{
		id: 'instagram',
		name: 'Instagram',
		icon: 'socials:instagram',
		brandColor: '#E4405F',
		description: 'Share visual content on Instagram.',
	},
	{
		id: 'linkedin',
		name: 'LinkedIn',
		icon: 'socials:linkedin',
		brandColor: '#0A66C2',
		description: 'Connect with professionals on LinkedIn.',
	},
];

// ----------------------------------------------------------------------

const getPageTitle = (_t: TFunction, seo?: boolean) => {
	let str: string = 'Get Started';

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

const OrganizationSchema = zod.object({
	organizationName: zod
		.string()
		.min(1, { message: 'Organization name is required' }),
	organizationDescription: zod.string().optional(),
	industry: zod.string().min(1, { message: 'Please select an industry' }),
});

type OrganizationFormData = zod.infer<typeof OrganizationSchema>;

// ----------------------------------------------------------------------

type StepWelcomeProps = {
	onGetStarted: () => void;
};

const StepWelcome = ({ onGetStarted }: StepWelcomeProps) => {
	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				textAlign: 'center',
				py: 4,
			}}
		>
			<Box
				sx={{
					width: 80,
					height: 80,
					borderRadius: '50%',
					bgcolor: 'primary.main',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					mb: 3,
				}}
			>
				<Iconify
					icon="solar:users-group-rounded-bold-duotone"
					width={40}
					sx={{ color: 'primary.contrastText' }}
				/>
			</Box>

			<Typography variant="h4" sx={{ mb: 2 }}>
				Welcome to {APP_NAME}!
			</Typography>

			<Typography
				variant="body1"
				sx={{ color: 'text.secondary', mb: 4, maxWidth: 480 }}
			>
				We are excited to have you on board! {APP_NAME} helps you manage and
				schedule your social media content across multiple platforms. Let us get
				your account set up in just a few steps.
			</Typography>

			<Button
				variant="contained"
				size="large"
				onClick={onGetStarted}
				endIcon={<Iconify icon="solar:forward-bold" />}
			>
				Get Started
			</Button>
		</Box>
	);
};

// ----------------------------------------------------------------------

type StepOrganizationProps = {
	methods: ReturnType<typeof useForm<OrganizationFormData>>;
};

const StepOrganization = ({ methods: _methods }: StepOrganizationProps) => {
	return (
		<Box sx={{ py: 2 }}>
			<Typography variant="h5" sx={{ mb: 1 }}>
				Create Your Organization
			</Typography>
			<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
				Set up your organization to start managing your social media presence.
			</Typography>

			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
				<Field.Text
					name="organizationName"
					label="Organization Name"
					placeholder="Enter your organization name"
					slotProps={{ inputLabel: { shrink: true } }}
				/>

				<Field.Text
					name="organizationDescription"
					label="Description (Optional)"
					placeholder="Brief description of your organization"
					multiline
					rows={3}
					slotProps={{ inputLabel: { shrink: true } }}
				/>

				<Field.Select
					name="industry"
					label="Industry"
					slotProps={{ inputLabel: { shrink: true } }}
				>
					<MenuItem value="" disabled>
						Select an industry
					</MenuItem>
					{INDUSTRIES.map((industry) => (
						<MenuItem key={industry.value} value={industry.value}>
							{industry.label}
						</MenuItem>
					))}
				</Field.Select>
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

type StepConnectAccountsProps = {
	connectedAccounts: string[];
	onConnect: (platformId: string) => void;
};

const StepConnectAccounts = ({
	connectedAccounts,
	onConnect,
}: StepConnectAccountsProps) => {
	return (
		<Box sx={{ py: 2 }}>
			<Typography variant="h5" sx={{ mb: 1 }}>
				Connect Social Accounts
			</Typography>
			<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
				Connect your social media accounts to start publishing content.
			</Typography>

			<Grid container spacing={2}>
				{SOCIAL_PLATFORMS.map((platform) => {
					const isConnected = connectedAccounts.includes(platform.id);

					return (
						<Grid key={platform.id} size={{ xs: 12, sm: 6 }}>
							<Card
								sx={{
									height: '100%',
									transition: 'box-shadow 0.2s',
									'&:hover': {
										boxShadow: (theme) => theme.shadows[4],
									},
								}}
							>
								<CardContent
									sx={{
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										textAlign: 'center',
										p: 2.5,
									}}
								>
									<Avatar
										sx={{
											width: 48,
											height: 48,
											bgcolor: platform.brandColor,
											color: 'common.white',
											mb: 1.5,
										}}
									>
										<Iconify icon={platform.icon} width={24} />
									</Avatar>

									<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
										{platform.name}
									</Typography>

									<Typography
										variant="caption"
										sx={{ color: 'text.secondary', mb: 2, minHeight: 36 }}
									>
										{platform.description}
									</Typography>

									<Button
										variant={isConnected ? 'outlined' : 'contained'}
										color={isConnected ? 'success' : 'primary'}
										size="small"
										onClick={() => onConnect(platform.id)}
										startIcon={
											<Iconify
												icon={
													isConnected
														? 'solar:check-circle-bold'
														: 'solar:add-circle-bold'
												}
											/>
										}
										sx={{
											...(!isConnected && {
												bgcolor: platform.brandColor,
												'&:hover': {
													bgcolor: platform.brandColor,
													filter: 'brightness(0.9)',
												},
											}),
										}}
									>
										{isConnected ? 'Connected' : 'Connect'}
									</Button>
								</CardContent>
							</Card>
						</Grid>
					);
				})}
			</Grid>
		</Box>
	);
};

// ----------------------------------------------------------------------

type StepCompleteProps = {
	organizationName: string;
	connectedAccounts: string[];
	onGoToDashboard: () => void;
};

const StepComplete = ({
	organizationName,
	connectedAccounts,
	onGoToDashboard,
}: StepCompleteProps) => {
	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				textAlign: 'center',
				py: 4,
			}}
		>
			<Box
				sx={{
					width: 80,
					height: 80,
					borderRadius: '50%',
					bgcolor: 'success.main',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					mb: 3,
				}}
			>
				<Iconify
					icon="solar:check-circle-bold"
					width={48}
					sx={{ color: 'success.contrastText' }}
				/>
			</Box>

			<Typography variant="h4" sx={{ mb: 2 }}>
				You are all set!
			</Typography>

			<Typography
				variant="body1"
				sx={{ color: 'text.secondary', mb: 4, maxWidth: 480 }}
			>
				Your account has been set up successfully. You can now start creating
				and scheduling posts.
			</Typography>

			<Card sx={{ width: '100%', maxWidth: 400, mb: 4 }}>
				<CardContent>
					<Typography
						variant="subtitle2"
						sx={{ color: 'text.secondary', mb: 2 }}
					>
						Setup Summary
					</Typography>

					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1.5,
							mb: 2,
						}}
					>
						<Iconify
							icon="solar:case-minimalistic-bold"
							width={24}
							sx={{ color: 'primary.main' }}
						/>
						<Box>
							<Typography variant="body2" sx={{ color: 'text.secondary' }}>
								Organization
							</Typography>
							<Typography variant="subtitle2">{organizationName}</Typography>
						</Box>
					</Box>

					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1.5,
						}}
					>
						<Iconify
							icon="solar:share-bold"
							width={24}
							sx={{ color: 'primary.main' }}
						/>
						<Box>
							<Typography variant="body2" sx={{ color: 'text.secondary' }}>
								Connected Accounts
							</Typography>
							<Typography variant="subtitle2">
								{connectedAccounts.length > 0
									? connectedAccounts
											.map((id) => {
												const platform = SOCIAL_PLATFORMS.find(
													(p) => p.id === id,
												);
												return platform?.name ?? id;
											})
											.join(', ')
									: 'None (you can connect later)'}
							</Typography>
						</Box>
					</Box>
				</CardContent>
			</Card>

			<Button
				variant="contained"
				size="large"
				onClick={onGoToDashboard}
				startIcon={<Iconify icon="solar:home-angle-bold-duotone" />}
			>
				Go to Dashboard
			</Button>
		</Box>
	);
};

// ----------------------------------------------------------------------

const OnboardingPage = () => {
	const navigate = useNavigate();
	const [activeStep, setActiveStep] = useState(0);
	const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);

	const methods = useForm<OrganizationFormData>({
		mode: 'onChange',
		resolver: zodResolver(OrganizationSchema),
		defaultValues: {
			organizationName: '',
			organizationDescription: '',
			industry: '',
		},
	});

	const {
		trigger,
		getValues,
		formState: { isValid },
	} = methods;

	const handleNext = useCallback(async () => {
		if (activeStep === 1) {
			// Validate organization step
			const isStepValid = await trigger([
				'organizationName',
				'organizationDescription',
				'industry',
			]);

			if (!isStepValid) {
				return;
			}
		}

		setActiveStep((prev) => prev + 1);
	}, [activeStep, trigger]);

	const handleBack = useCallback(() => {
		setActiveStep((prev) => prev - 1);
	}, []);

	const handleConnectAccount = useCallback((platformId: string) => {
		setConnectedAccounts((prev) => {
			if (prev.includes(platformId)) {
				return prev.filter((id) => id !== platformId);
			}
			return [...prev, platformId];
		});

		// In a real app, this would trigger OAuth flow
		toast.success(`Connected to ${platformId}!`);
	}, []);

	const handleGoToDashboard = useCallback(() => {
		// TODO: In a real app, this would:
		// 1. Save the organization to the API
		// 2. Navigate to the tenant dashboard

		// For now, navigate to the home page
		navigate(FRONT_PATH_NAMES.home);
	}, [navigate]);

	const handleSkipSocialAccounts = useCallback(() => {
		setActiveStep((prev) => prev + 1);
	}, []);

	const renderStepContent = () => {
		switch (activeStep) {
			case 0:
				return <StepWelcome onGetStarted={handleNext} />;
			case 1:
				return <StepOrganization methods={methods} />;
			case 2:
				return (
					<StepConnectAccounts
						connectedAccounts={connectedAccounts}
						onConnect={handleConnectAccount}
					/>
				);
			case 3:
				return (
					<StepComplete
						organizationName={
							getValues('organizationName') || 'Your Organization'
						}
						connectedAccounts={connectedAccounts}
						onGoToDashboard={handleGoToDashboard}
					/>
				);
			default:
				return null;
		}
	};

	const renderNavigation = () => {
		// Don't show navigation for welcome and complete steps
		if (activeStep === 0 || activeStep === 3) {
			return null;
		}

		return (
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					mt: 4,
					pt: 3,
					borderTop: (theme) => `1px dashed ${theme.palette.divider}`,
				}}
			>
				<Button
					color="inherit"
					onClick={handleBack}
					startIcon={<Iconify icon="solar:reply-bold" />}
				>
					Back
				</Button>

				<Box sx={{ display: 'flex', gap: 1 }}>
					{activeStep === 2 && (
						<Button color="inherit" onClick={handleSkipSocialAccounts}>
							Skip for now
						</Button>
					)}

					<Button
						variant="contained"
						onClick={handleNext}
						endIcon={<Iconify icon="solar:forward-bold" />}
						disabled={activeStep === 1 && !isValid}
					>
						{activeStep === 2 ? 'Finish' : 'Next'}
					</Button>
				</Box>
			</Box>
		);
	};

	return (
		<SimpleLayout
			slotProps={{
				content: { compact: true },
			}}
			cssVars={{
				'--layout-simple-content-compact-width': '720px',
			}}
		>
			<Card
				sx={{
					p: { xs: 3, md: 5 },
					width: '100%',
				}}
			>
				{/* Stepper */}
				<Stepper
					activeStep={activeStep}
					alternativeLabel
					sx={{
						mb: 5,
						'& .MuiStepLabel-label': {
							typography: 'caption',
						},
					}}
				>
					{STEPS.map((label, index) => (
						<Step key={label}>
							<StepLabel
								slots={{
									stepIcon: ({ active, completed }) => (
										<Box
											sx={{
												width: 28,
												height: 28,
												display: 'flex',
												borderRadius: '50%',
												alignItems: 'center',
												justifyContent: 'center',
												typography: 'subtitle2',
												color: 'text.disabled',
												bgcolor: 'action.disabledBackground',
												...(active && {
													bgcolor: 'primary.main',
													color: 'primary.contrastText',
												}),
												...(completed && {
													bgcolor: 'primary.main',
													color: 'primary.contrastText',
												}),
											}}
										>
											{completed ? (
												<Iconify width={16} icon="solar:check-circle-bold" />
											) : (
												index + 1
											)}
										</Box>
									),
								}}
							>
								{label}
							</StepLabel>
						</Step>
					))}
				</Stepper>

				{/* Progress indicator */}
				<Typography
					variant="caption"
					sx={{
						display: 'block',
						textAlign: 'center',
						color: 'text.secondary',
						mb: 3,
					}}
				>
					Step {activeStep + 1} of {STEPS.length}
				</Typography>

				{/* Step content */}
				<Form methods={methods}>
					<Box
						sx={{
							minHeight: 320,
						}}
					>
						{renderStepContent()}
					</Box>

					{renderNavigation()}
				</Form>
			</Card>
		</SimpleLayout>
	);
};

export default OnboardingPage;
